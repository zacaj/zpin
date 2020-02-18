package zpin;
import java.io.ByteArrayOutputStream;
import java.io.Closeable;
import java.io.IOException;
import java.util.Arrays;
import java.util.Date;
import java.util.Scanner;
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
import com.pi4j.io.spi.SpiChannel;
import com.pi4j.io.spi.SpiDevice;
import com.pi4j.io.spi.SpiFactory;

public class JPiIO {
	GpioController gpio = GpioFactory.getInstance();
	
	GpioPinDigitalOutput[] selects = new GpioPinDigitalOutput[8];
//	GpioPinDigitalOutput mosi = gpio.provisionDigitalOutputPin(RaspiPin.GPIO_12, PinState.LOW);
//	GpioPinDigitalInput miso = gpio.provisionDigitalInputPin(RaspiPin.GPIO_13, PinPullResistance.OFF);
//	GpioPinDigitalOutput clk = gpio.provisionDigitalOutputPin(RaspiPin.GPIO_14, PinState.LOW);
	SpiDevice spi;
	
	private JPiIO() {
		Pin[] ss = {
			RaspiPin.GPIO_09,
			RaspiPin.GPIO_07,
			RaspiPin.GPIO_21,
			RaspiPin.GPIO_22,
			RaspiPin.GPIO_11,
			RaspiPin.GPIO_10,
			RaspiPin.GPIO_26,
			RaspiPin.GPIO_23,
		};
		for (int i = 0; i<ss.length; i++) {
			selects[i] = gpio.provisionDigitalOutputPin(ss[i], PinState.HIGH);
		}
		try {
			spi = SpiFactory.getInstance(SpiChannel.CS0, 5000000); // 25000000
		} catch (IOException e) {
			throw new RuntimeException(e);
		}
	}
	
	private static JPiIO instance = null;
	public static JPiIO get() {
		if (instance == null) {
			instance = new JPiIO();
		}
		return instance;
	}
	
	private ReentrantLock lock = new ReentrantLock();
	
	void checkLock() {
		if (!lock.isHeldByCurrentThread())
			throw new RuntimeException("IO Locked");
	}
	
	boolean waitLock(long timeout) throws InterruptedException {
		return lock.tryLock(timeout, TimeUnit.MILLISECONDS);
	}
	
	void lock() {
		if (!lock.tryLock())
			throw new RuntimeException("IO Locked");
	}
	
	void unlock() {
		lock.unlock();
	}

	public void select(int n) {
		checkLock();
		for (int i=0; i<selects.length; i++)
			selects[i].setState(n != i);
	}
	
	public Closeable selectWith(int n) {
		this.select(n);
		return new Closeable() {
			public void close() {
				JPiIO.this.select(-1);
			}
		};
	}
	
	public void selectAnd(int n, Runnable a) {
		this.select(n);
		try {
			a.run();
		}
		finally {
			this.select(-1);
		}
	}
	
	public void spiWrite(byte ...data) {
		checkLock();
		//System.out.print("write byte");
//		for (byte b : data) {
//			for (int i=7; i>=0; i--) {
//				clk.low();
//				mosi.setState((b & (1<<i)) != 0);
//				clk.high();
//			}
//		//	System.out.print(" " + b);
//		}
		//System.out.println();

		System.out.println("write bytes "+Arrays.toString(data));
		try {
			spi.write(data);
		} catch (IOException e) {
			throw new RuntimeException(e);
		}
//		clk.low();
	}
	public byte[] spiRead(int bytes) {
		checkLock();
//		clk.low();
//		byte[] data = new byte[bytes];
//	
//		for (int j=0; j<bytes; j++) {
//			byte b = 0;
//			for (int i=7; i>=0; i--) {
//				clk.high();
//				b |= (miso.isState(PinState.HIGH)? 1:0) << i;
//				clk.low();
//			}
//			System.out.println("read byte " + b);
//			data[j] = b;
//		}
		byte[] data;
		try {
			data = spi.write(new byte[bytes]);
			System.out.println("read bytes "+Arrays.toString(data));
		} catch (IOException e) {
			throw new RuntimeException(e);
		}
		return data;
	}
	
	byte checkSum(byte[] bytes) {
		byte sum = 0;
		for (int i=0; i<bytes.length; i++)
			sum += bytes[i];
		return sum;
	}
	byte[] int2byte(int[] ints) {
		byte[] bytes = new byte[ints.length];
		for (int i=0; i<ints.length; i++)
			bytes[i] = (byte)ints[i];
		return bytes;
	}

	public void sendCommand0(int ...ints) throws Error {
		sendCommand0(int2byte(ints));
	}
	public void sendCommand0(byte ...bytes) throws Error {
		sendCommandExpect(0, bytes);
	}
	public byte[] sendCommand(int ...ints) throws Error {
		return sendCommand(int2byte(ints));
	}
	public byte[] sendCommand(byte ...bytes) throws Error {
		checkLock();
		
		if ("Simulated".equals(System.getenv("PI4J_PLATFORM"))) {
			System.out.println("send command "+bytes);
			System.out.print("> ");
			Scanner s = new Scanner(System.in);
			String[] ss = s.nextLine().split(" ");
			byte[] ret = new byte[ss.length];
			for (int i=0; i<ss.length; i++)
				ret[i] = Byte.parseByte(ss[i]);
			s.close();
			return ret;
		}
		
		byte[] out = new byte[bytes.length + 4];
		out[0] = 'S';
		out[1] = (byte)bytes.length;
		System.arraycopy(bytes, 0, out, 2, bytes.length);
		out[bytes.length + 2] = checkSum(bytes);
		out[bytes.length + 3] = 'E';
		long start = System.nanoTime();
		spiWrite(out);
		long end = System.nanoTime();
		System.out.println("Send command in "+(((float)(end-start))/1000000.0)+" ms");
		System.out.println("begin wait for ready signal");
		byte ready = 0;
		//clk.low();
		Date waitStart = new Date();
		while ((ready&0xFF) != 'R') {
			System.out.print("w");
//			clk.high();
//			int in = miso.isState(PinState.HIGH)? 1:0;
//			ready = (byte) ((ready<<1) | in);
//			System.out.print(" "+in);
//			clk.low();
			try {
				ready = spi.write(new byte[1])[0];
			} catch (IOException e) {
				throw new RuntimeException(e);
			}
			System.out.print("r "+Integer.toBinaryString((ready&0xFF))+".  ");
			if ((ready&0xFF) == 'L') {
				throw new Error("sent wrong length command ("+bytes.length+"), board wanted "+spiRead(1)[0]);
			}
			if ((ready&0xFF) == 'C') {
				throw new Error("checksum fail from board");
			}
			if (new Date().getTime() - waitStart.getTime() > 200)
				throw new Error("timeout waiting for board");
		}
		System.out.println("\ngot ready signal");
		byte numInputBytes = spiRead(1)[0];
		if (numInputBytes > 0) {
			byte[] input = spiRead(numInputBytes+1);
			byte[] in = Arrays.copyOf(input, numInputBytes);
			byte sum = checkSum(in);
			byte inputSum = input[numInputBytes];
			if (sum != inputSum)
				throw new Error("checksum fail, input "+inputSum+" != "+sum+" for bytes "+Arrays.toString(in));
			return in;
		}
		return new byte[0];
	}

	public byte[] sendCommandExpect(int expectedLength, int ...bytes) throws Error {
		return sendCommandExpect(expectedLength, int2byte(bytes));
	}
	public byte[] sendCommandExpect(int expectedLength, byte ...bytes) throws Error {
		byte[] output = sendCommand(bytes);
		if (output.length != expectedLength)
			throw new Error("got wrong message length back (length "+output.length+")");
		return output;
	}
	
	public class CommandBuilder {
		ByteArrayOutputStream stream = new ByteArrayOutputStream();
		
		public CommandBuilder bytes(byte ...bytes) {
			for (int i=0; i<bytes.length; i++)
				stream.write(bytes[i]);
			return this;
		}
		public CommandBuilder bytes(int ...bytes) {
			bytes(int2byte(bytes));
			return this;
		}
		public CommandBuilder ints(int ...ints) {
			for (int i=0; i<ints.length; i++) {
				bytes(new int[] {
					(ints[i] >> 0) & 0xFF,
					(ints[i] >> 8) & 0xFF,
					(ints[i] >> 16) & 0xFF,
					(ints[i] >> 24) & 0xFF,
				});
			}
			return this;
		}
		public byte[] send() {
			return sendCommand(stream.toByteArray());
		}
		public void send0() {
			sendExpect(0);
		}
		public byte[] sendExpect(int expectedLength) {
			return sendCommandExpect(expectedLength, stream.toByteArray());
		}
	}
	
	public CommandBuilder buildCommand() {
		return new CommandBuilder();
	}
	

	public static void main(String[] args) {
		new JPiIO().buildCommand().ints(255);
	}
	
	public class Error extends RuntimeException {

		public Error(String string) {
			super(string);
		}
		
	}

}
