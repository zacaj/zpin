package zpin;

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
	GpioPinDigitalInput detect3 = gpio.provisionDigitalInputPin(RaspiPin.GPIO_23, PinPullResistance.PULL_UP); // 33
	
	static long startTime = 0;
	
	int curCol = 0;
	final int Width = 16;
	final int Height = 8;
	
	class Switch {
		boolean state = false;
		boolean rawState = false;
		boolean inverted = false;
		double minOnTime = 1;
		double minOffTime = 1;
		double rawLastOnAt = 0;
		double rawLastOffAt = 0;
		String name = null;
		Solenoid16 triggerBoard = null;
		byte triggerNum = 0;
		

		public void update(int row, int col, boolean on) throws InterruptedException {
			Switch sw = this;
			double ms = ms();
			boolean fastReact = (sw.rawState && !sw.state && sw.minOnTime == 0);
			if (on != sw.rawState && !fastReact) {
				sw.rawState = on;
				if (on) sw.rawLastOnAt = ms;
				else sw.rawLastOffAt = ms;
				System.out.println("  raw switch change "+row+","+col+"->"+(sw.rawState? "true ":"false")+" @"+ms+(sw.name!=null? "     "+sw.name:""));
			} else if ((sw.rawState != sw.state && ((sw.rawState && ms-sw.rawLastOnAt>=sw.minOnTime) || (!sw.rawState && ms-sw.rawLastOffAt>=sw.minOffTime)))
					|| fastReact) {
				Event e = new Event();
				e.col = col;
				e.row = row;
				e.when = ms;
				e.state = sw.rawState;
				e.name = sw.name;
				sw.state = sw.rawState;
				events.add(e);
				
				
				System.out.println("NEW   switch event: "+e);
				
				if (e.state && sw.triggerBoard!=null) {
					if (SatIO.waitLock(1)) {
						try {
							System.out.println("      trigger solenoid");
							sw.triggerBoard.fireSolenoid(sw.triggerNum);
						} 
						finally {
							SatIO.unlock();
						}
					}
					else {
						System.out.println("ERR   couldn't lock IO for trigger");
					}
				}
			}
		}
	}
	
	Switch[] switches = new Switch[Width*Height];
	
	Queue<Event> events = new ConcurrentLinkedQueue<>();
	
	private SwitchMatrix() {	
		SwitchMatrix.startTime = System.nanoTime();
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
		
		nameSwitches();
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
		double last = 0;
		lock();
		setCol(-1);
		unlock();
		boolean power = detect3.isHigh();
		while(true) {
			try {
				lock();
//				if (curCol == 0) {
//					if (last > 0)
//						System.out.println("scan time = " +  (new Date().getTime() - last));
//					last = new Date().getTime();
//				}
//				setCol(curCol);
//				Thread.sleep(0, 5);
				serLatch.low();
				serClk.low();
				serOut.setState(curCol != 0);
				serClk.high();
				serLatch.high();
				Thread.sleep(0, curCol<=2? 12 : 2);
				for (int row = 0; row<Height; row++) {
					if (!power) break;
					Switch sw = switches[row*Width+curCol];
					boolean on = returns[row].isState(PinState.LOW) ^ sw.inverted;
					sw.update(row, curCol, on);
				}
				
				curCol++;
				if (curCol >= 9) {
					curCol = 0;
//					Thread.sleep(0, 7);
					
					power = detect3.isHigh();
//					System.out.println("power: "+power);
					switches[15].update(0, 15, power);
				}
			} catch(Exception e) {
				e.printStackTrace();
			} finally {
				unlock();
			}
			
		}
	}
	
	public static double ms() {
		return ((double)(System.nanoTime() - startTime)) / 1000000.0; 
	}
	
	public static class Event {
		int row, col;
		boolean state;
		double when;
		String name;
		
		public String toString() {
			return ""+row+","+col+"->"+(state? "true ":"false")+" @"+when+(name!=null? "     "+name:"")+(state? " CLOSE": "   open");
		}
	}
	
	
	
	void nameSwitch(int row, int col, String name) {
		switches[row*Width+col].name = name;
	}
	
	void nameSwitches() {
		nameSwitch(1, 2, "left inlane");
		nameSwitch(1, 1, "left outlane");
		nameSwitch(0, 4, "right inlane");
		nameSwitch(0, 5, "right outlane");
		nameSwitch(0, 3, "mini out");
		nameSwitch(0, 2, "outhole");
		nameSwitch(0, 1, "trough full");
		nameSwitch(1, 0, "left sling");
		nameSwitch(0, 7, "right sling");
		nameSwitch(1, 7, "mini left");
		nameSwitch(1, 6, "mini center");
		nameSwitch(1, 5, "mini right");
		nameSwitch(4, 3, "center left");
		nameSwitch(4, 2, "center center");
		nameSwitch(4, 1, "center right");
		nameSwitch(3, 1, "left 1");
		nameSwitch(3, 2, "left 2");
		nameSwitch(3, 3, "left 3");
		nameSwitch(3, 5, "left 4");
		nameSwitch(2, 5, "right 1");
		nameSwitch(2, 4, "right 2");
		nameSwitch(2, 3, "right 3");
		nameSwitch(2, 2, "right 4");
		nameSwitch(2, 1, "right 5");
		nameSwitch(3, 4, "left back 1");
		nameSwitch(3, 6, "left back 2");
		nameSwitch(5, 2, "");
		nameSwitch(5, 1, "upper 3 center");
		nameSwitch(5, 0, "upper 3 right");
		nameSwitch(6, 4, "upper 2 left");
		nameSwitch(6, 3, "upper 2 right");
		nameSwitch(7, 3, "single standup");
		nameSwitch(3, 7, "ramp mini");
		nameSwitch(3, 0, "ramp mini outer");
		nameSwitch(7, 4, "ramp up");
		nameSwitch(7, 7, "under ramp");
		nameSwitch(7, 2, "left orbit");
		nameSwitch(6, 6, "spinner");
		nameSwitch(6, 2, "spinner mini");
		nameSwitch(6, 7, "upper pop mini");
		nameSwitch(6, 0, "side pop mini");
		nameSwitch(2, 6, "shooter upper");
		nameSwitch(2, 7, "shooter magnet");
		nameSwitch(0, 0, "shooter lane");
		nameSwitch(2, 0, "shooter lower");
		nameSwitch(5, 5, "back lane");
		nameSwitch(4, 7, "pop");
		nameSwitch(7, 1, "upper inlane");
		nameSwitch(7, 5, "under upper flipper");
		nameSwitch(7, 6, "upper eject");
		nameSwitch(6, 5, "upper lane 2");
		nameSwitch(5, 7, "upper lane 3");
		nameSwitch(5, 3, "upper lane 4");
		nameSwitch(7, 0, "ramp made");
		nameSwitch(0, 8, "start");
		nameSwitch(4, 8, "left flipper");
		nameSwitch(1, 8, "right flipper");
		nameSwitch(6, 8, "left magnet");
		nameSwitch(5, 8, "right magnet ");
		nameSwitch(2, 8, "tilt");
		nameSwitch(3, 8, "actionButton");
		nameSwitch(0, 15, "detect power");
	}
}
