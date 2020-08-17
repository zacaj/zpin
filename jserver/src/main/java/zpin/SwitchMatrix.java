package zpin;

import java.util.Arrays;
import java.util.Date;
import java.util.Queue;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.locks.ReentrantLock;

import com.pi4j.io.gpio.GpioController;
import com.pi4j.io.gpio.GpioFactory;
import com.pi4j.io.gpio.GpioPinDigitalInput;
import com.pi4j.io.gpio.GpioPinDigitalOutput;
import com.pi4j.io.gpio.Pin;
import com.pi4j.io.gpio.PinPullResistance;
import com.pi4j.io.gpio.PinState;
import com.pi4j.io.gpio.RaspiPin;

public class SwitchMatrix extends Thread {
	GpioController gpio = GpioFactory.getInstance();
	
	GpioPinDigitalInput[] returns = new GpioPinDigitalInput[8];
	GpioPinDigitalOutput serOut = gpio.provisionDigitalOutputPin(RaspiPin.GPIO_25, PinState.LOW);
	GpioPinDigitalOutput serClk = gpio.provisionDigitalOutputPin(RaspiPin.GPIO_02, PinState.HIGH); // 11
	GpioPinDigitalOutput serLatch = gpio.provisionDigitalOutputPin(RaspiPin.GPIO_06, PinState.LOW); // 12
	
	int curCol = 0;
	final int Width = 16;
	final int Height = 8;
	
	class Switch {
		boolean state = false;
		boolean rawState = false;
		int minOnTime = 1;
		int minOffTime = 1;
		long rawLastOnAt = 0;
		long rawLastOffAt = 0;
	}
	
	Switch[] switches = new Switch[Width*Height];
	
	Queue<Event> events = new ConcurrentLinkedQueue<>();
	
	private SwitchMatrix() {		
		Pin[] rets = {
			RaspiPin.GPIO_15,
			RaspiPin.GPIO_16,
			RaspiPin.GPIO_27,
			RaspiPin.GPIO_00,
			RaspiPin.GPIO_24,
			RaspiPin.GPIO_28,
			RaspiPin.GPIO_29,
			RaspiPin.GPIO_03,
		};
		for (int i = 0; i<rets.length; i++) {
			returns[i] = gpio.provisionDigitalInputPin(rets[i], PinPullResistance.PULL_UP);
		}

		for (int x=0; x<Width; x++)
			for (int y=0; y<Height; y++)
				switches[x+y*Width] = new Switch();
	}
	
	private static SwitchMatrix instance = null;
	public static SwitchMatrix get() {
		if (instance == null) {
			instance = new SwitchMatrix();
		}
		return instance;
	}

	
	private static ReentrantLock lock = new ReentrantLock();
	
	static void checkLock() {
		if (!lock.isHeldByCurrentThread())
			throw new RuntimeException("IO Locked");
	}
	
	static boolean waitLock(long timeout) throws InterruptedException {
		return lock.tryLock(timeout, TimeUnit.MILLISECONDS);
	}
	
	static void lock() {
		if (!lock.tryLock())
			throw new RuntimeException("IO Locked");
	}
	
	static void unlock() {
		lock.unlock();
	}
	
	void setCol(int col) {
		checkLock();
		serLatch.low();
		for (int i=Width-1; i>=0; i--) {
			serClk.low();
			serOut.setState(i != col);
			serClk.high();
		}
		//serLatch.pulse(200, TimeUnit.MILLISECONDS);
		serLatch.high();
	}
	
	@Override
    public void run() {
		long last = 0;
		while(true) {
			try {
				lock();
//				if (curCol == 0) {
//					if (last > 0)
//						System.out.println("scan time = " +  (new Date().getTime() - last));
//					last = new Date().getTime();
//				}
				setCol(curCol);
//				Thread.sleep(0, 5);
				for (int row = 0; row<Height; row++) {
					boolean on = returns[row].isState(PinState.LOW);
					Switch sw = switches[row*Width+curCol];
					if (on != sw.rawState) {
						sw.rawState = on;
						if (on) sw.rawLastOnAt = new Date().getTime();
						else sw.rawLastOffAt = new Date().getTime();
						//System.out.println("raw switch change "+curCol+","+row+"->"+sw.rawState+" @"+new Date().getTime());
					} else if (sw.rawState != sw.state && ((sw.rawState && new Date().getTime()-sw.rawLastOnAt>sw.minOnTime) || (!sw.rawState && new Date().getTime()-sw.rawLastOffAt>sw.minOffTime))) {
						Event e = new Event();
						e.col = curCol;
						e.row = row;
						e.when = new Date().getTime();
						e.state = on;
						events.add(e);
						
						sw.state = sw.rawState;
						
						System.out.println("new switch event: "+e);
					}
				}
			} catch(Exception e) {
				e.printStackTrace();
			} finally {
				unlock();
			}
			
			
			curCol++;
			if (curCol >= 9)
				curCol = 0;
		}
	}
	
	public static class Event {
		int row, col;
		boolean state;
		long when;
		
		public String toString() {
			return ""+row+","+col+"="+state+"@"+when;
		}
	}
}
