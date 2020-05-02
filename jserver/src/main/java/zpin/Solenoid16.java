package zpin;

import zpin.SatIO.Error;

public class Solenoid16 extends Board {
	final int apiRev = 2;
	boolean[] state = new boolean[16];
	
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
			this.disableSolenoid((byte) (i));
		}
	}

	byte startCommand(byte num, int cmd) {
		return (byte) (cmd << 4 | (num));
	}

	void fireSolenoid(byte num) {
		io.selectAnd(boardNum, () -> {
			io.sendCommand0(
				this.startCommand(num, 0)
			);
		});
	}

	void fireSolenoidFor(byte num, int onTime) {
		io.selectAnd(boardNum, () -> {
			io.buildCommand()
			.bytes(
				this.startCommand(num, 0b0001)
			).ints(
				onTime
			).send0();
		});
	}

	void turnOnSolenoid(byte num){
		io.selectAnd(boardNum, () -> {
			io.sendCommand0(
				this.startCommand(num, 0b0011)
			);
		});
		this.state[num] = true;
	}
	void turnOffSolenoid(byte num){
		io.selectAnd(boardNum, () -> {
			io.sendCommand0(
				this.startCommand(num, 0b0100)
			);
		});
		this.state[num] = false;
	}
	void toggleSolenoid(byte num){
		this.state[num] = !this.state[num];
		if (this.state[num]) this.turnOnSolenoid(num);
		else this.turnOffSolenoid(num);
	}

	void disableSolenoid(byte num) {
		io.selectAnd(boardNum, () -> {
			io.buildCommand()
			.bytes(
				this.startCommand(num, 0b0110),
				SolenoidMode.Disabled.getValue()
			).ints(
				0
			).bytes(
				0
			).send0();
		});
		this.state[num] = false;
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
				0
			).bytes(
				0
			).ints(
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
				0,
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
		initTriggered(num, triggeredBy, minOnTime, maxOnTime, (byte) 0);		
	}
	void initTriggered(byte num, byte triggeredBy, int minOnTime, int maxOnTime, byte pulseOffTime) {
		io.selectAnd(boardNum, () -> {
			io.buildCommand()
			.bytes(
				this.startCommand(num, 0b0110),
				SolenoidMode.Input.getValue()
			).ints(
				0
			).bytes(
				pulseOffTime,
				triggeredBy
			).ints(
				minOnTime,
				maxOnTime
			).send0();
		});
	}

	void initOnOff(byte num) {
		initOnOff(num, 0);
	}
	void initOnOff(byte num, int maxOnTime) {
		initOnOff(num, maxOnTime, (byte) 0);
	}
	void initOnOff(byte num, int maxOnTime, byte pulseOffTime) {
		initOnOff(num, maxOnTime, pulseOffTime, (byte) 1);
	}
	void initOnOff(byte num, int maxOnTime, byte pulseOffTime, byte pulseOnTime) {
		io.selectAnd(boardNum, () -> {
			io.buildCommand()
			.bytes(
				this.startCommand(num, 0b0110),
				SolenoidMode.OnOff.getValue()
			).ints(
				0
			).bytes(
					pulseOffTime,
					pulseOnTime
			).ints(
				maxOnTime
			).send0();
		});
	}
}


