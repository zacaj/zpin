package zpin;

import zpin.JPiIO.Error;

public class Solenoid16 extends Board {
	final int apiRev = 1;
	
	enum SolenoidMode {
		Disabled(0),
	    Input(1),
	    Momentary(2),
	    OnOff(3),
	    Triggered(4);
	    		
	    private final byte id;
	    SolenoidMode(int id) { this.id = (byte)id; }
	    public byte getValue() { return id; }
	}
	
	Solenoid16(int board) throws Error {
		super(board);
		identify();
		if (type != Type.Solenoid16)
			throw new RuntimeException("wrong board type "+type);
		if (apiRev != apiRevision)
			throw new RuntimeException("wrong api revision "+apiRevision);
		System.out.println("Identified S16 board at "+board);

		for (int i=0; i<16; i++) {
			this.disableSolenoid((byte) (i+1));
		}
	}

	byte startCommand(byte num, int cmd) {
		return (byte) (cmd << 4 | (num - 1));
	}

	void fireSolenoid(byte num) throws Error {
		io.selectAnd(boardNum, () -> {
			io.sendCommand0(
				this.startCommand(num, 0)
			);
		});
	}

	void fireSolenoidFor(byte num, byte onTime) {
		io.selectAnd(boardNum, () -> {
			io.sendCommand0(
				this.startCommand(num, 0b0001),
				onTime
			);
		});
	}

	void disableSolenoid(byte num) {
		io.selectAnd(boardNum, () -> {
			io.buildCommand()
			.bytes(
				this.startCommand(num, 0b0110),
				SolenoidMode.Disabled.getValue()
			).ints(
				0
			).send0();
		});
	}

	void initMomentary(byte num) {
		initMomentary(num, (byte)50);
	}
	void initMomentary(byte num, int onTime) {
		io.selectAnd(boardNum, () -> {
			io.buildCommand()
			.bytes(
				this.startCommand(num, 0b0110),
				SolenoidMode.Momentary.getValue()
			).ints(
				0,
				onTime
			).send0();
		});
	}

	void initInput(byte num) {
		initInput(num, 3);
	}
	void initInput(byte num, int settleTime) {
		io.selectAnd(boardNum, () -> {
			io.buildCommand()
			.bytes(
				this.startCommand(num, 0b0110),
				SolenoidMode.Input.getValue()
			).ints(
				0
			).bytes(
				settleTime
			).send0();
		});
	}

	void initTriggered(byte num, byte triggeredBy) {
		initTriggered(num, triggeredBy, 0);
	}
	void initTriggered(byte num, byte triggeredBy, int minOnTime) {
		initTriggered(num, triggeredBy, 0, 50);		
	}
	void initTriggered(byte num, byte triggeredBy, int minOnTime, int maxOnTime) {
		io.selectAnd(boardNum, () -> {
			io.buildCommand()
			.bytes(
				this.startCommand(num, 0b0110),
				SolenoidMode.Input.getValue()
			).ints(
				0
			).bytes(
				triggeredBy - 1
			).ints(
				minOnTime,
				maxOnTime
			).send0();
		});
	}
}


