package zpin;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.Arrays;
import java.util.Date;
import java.util.Scanner;

import com.pi4j.io.gpio.GpioController;
import com.pi4j.io.gpio.GpioFactory;
import com.pi4j.io.gpio.GpioPinDigitalInput;
import com.pi4j.io.gpio.GpioPinDigitalOutput;
import com.pi4j.io.gpio.Pin;
import com.pi4j.io.gpio.PinPullResistance;
import com.pi4j.io.gpio.PinState;
import com.pi4j.io.gpio.RaspiPin;

import java.util.concurrent.TimeUnit;
import java.util.concurrent.locks.ReentrantLock;
import java.util.regex.Pattern;
import java.util.stream.StreamSupport;

public class JPiIO {
	GpioController gpio = GpioFactory.getInstance();
	
	GpioPinDigitalOutput[] selects = new GpioPinDigitalOutput[8];
	GpioPinDigitalOutput mosi = gpio.provisionDigitalOutputPin(RaspiPin.GPIO_12, PinState.LOW);
	GpioPinDigitalInput miso = gpio.provisionDigitalInputPin(RaspiPin.GPIO_13, PinPullResistance.OFF);
	GpioPinDigitalOutput clk = gpio.provisionDigitalOutputPin(RaspiPin.GPIO_14, PinState.LOW);
	
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
	
	public void spiWrite(byte ...data) {
		checkLock();
		for (byte b : data) {
			for (int i=7; i>=0; i--) {
				clk.low();
				mosi.setState((b & (1<<i)) != 0);
				clk.high();
			}
			System.out.println("write byte " + b);
		}
		clk.low();
	}
	public byte[] spiRead(int bytes) {
		checkLock();
		byte[] data = new byte[bytes];
		clk.low();
	
		for (int j=0; j<bytes; j++) {
			byte b = 0;
			for (int i=7; i>=0; i--) {
				clk.high();
				b |= (miso.isState(PinState.HIGH)? 1:0) << i;
				clk.low();
			}
			System.out.println("read byte " + b);
			data[j] = b;
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
		
		if (System.getenv("PI4J_PLATFORM").equals("Simulated")) {
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
		
		spiWrite(
			(byte)'S',
			(byte)bytes.length
		);
		spiWrite(bytes);
		spiWrite(
			checkSum(bytes),
			(byte)'E'
		);
		byte ready = 0;
		clk.low();
		Date waitStart = new Date();
		while (ready != 'R') {
			clk.high();
			ready <<= miso.isHigh()? 1:0;
			clk.low();
			if (ready == 'L') {
				throw new Error("sent wrong length command ("+bytes.length+"), board wanted "+spiRead(1)[0]);
			}
			if (ready == 'C') {
				throw new Error("checksum fail from board");
			}
			if (new Date().getTime() - waitStart.getTime() > 10)
				throw new Error("timeout waiting for board");
		}
		byte numInputBytes = spiRead(1)[0];
		if (numInputBytes > 0) {
			byte[] input = spiRead(numInputBytes);
			byte sum = checkSum(input);
			byte inputSum = spiRead(1)[0];
			if (sum != inputSum)
				throw new Error("checksum fail, input "+input+" != "+sum+" for bytes "+input);
			return input;
		}
		return new byte[0];
	}

	public byte[] sendCommandExpect(int expectedLength, int ...bytes) throws Error {
		return sendCommandExpect(expectedLength, int2byte(bytes));
	}
	public byte[] sendCommandExpect(int expectedLength, byte ...bytes) throws Error {
		byte[] output = sendCommand(bytes);
		if (output.length != expectedLength)
			throw new Error("got wrong identify message back (length "+output.length+")");
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
					(i >> 0) & 0xFF,
					(i >> 8) & 0xFF,
					(i >> 16) & 0xFF,
					(i >> 24) & 0xFF,
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
		// TODO Auto-generated method stub

	}
	
	public class Error extends RuntimeException {

		public Error(String string) {
			super(string);
		}
		
	}

}
