package zpin;

import java.util.Arrays;
import java.util.Optional;

import zpin.SatIO.Error;

public class Board {
	public enum Type {
		Unknown(-1),
		Solenoid16 (5);
		
	    private final int id;
	    Type(int id) { this.id = id; }
	    public int getValue() { return id; }
	};
	
	public int boardNum;
	public Type type = Type.Unknown;
	public int hwRevision = -1;
	public int apiRevision = -1;
	
	public Board(int number) {
		this.boardNum = number;
	}
	
	public void identify() throws Error {
		io.selectAnd(boardNum, () -> {
			byte[] id = io.sendCommandExpect(2, 0b11111110);
			int type = id[0] & 0b1111;
			Optional<Type> _type = Arrays.stream(Type.values()).filter(t -> t.getValue() == type).findFirst();
			if (!_type.isPresent())
				throw new RuntimeException("board type "+type+" returned by board "+boardNum+" not invalid");
			this.type = _type.get();
			this.hwRevision = (id[0] & 0b11110000) >> 4;
			this.apiRevision = id[1];
		});
	}
	
	public int heartbeat() throws Error {
		io.select(boardNum);
		try {
			byte[] data = io.sendCommandExpect(2, 0b11111111);
			int hb = (data[0] << 8) | (data[1]);
			return hb;
		}
		finally {
			io.select(-1);
		}
	}
	
	SatIO io = SatIO.get();
}
