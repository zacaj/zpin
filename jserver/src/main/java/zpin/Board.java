package zpin;

import java.util.Arrays;
import java.util.Optional;

import zpin.JPiIO.Error;

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
		io.select(boardNum);
		byte[] id = io.sendCommandExpect(2, 0b11111110);
		int type = id[0] & 0b11111;
		Optional<Type> _type = Arrays.stream(Type.values()).filter(t -> t.getValue() == type).findFirst();
		if (!_type.isPresent())
			throw new RuntimeException("board type "+type+" returned by board "+boardNum+" not invalid");
		this.type = _type.get();
		this.hwRevision = (id[0] & 0b11110000) >> 4;
		this.apiRevision = id[1];
	}
	
	JPiIO io = JPiIO.get();
}
