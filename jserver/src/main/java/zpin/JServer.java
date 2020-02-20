package zpin;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.PrintWriter;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.SocketException;
import java.util.Arrays;
import java.util.Date;


/**
 * Hello world!
 *
 */
public class JServer extends Thread
{
	public static String version = "0.0.1";
	public static int nConnections = 0;
	
    private Socket socket;
    private PrintWriter out;
    private BufferedReader in;
    public int connNum = ++nConnections;
    
    static SwitchMatrix matrix = SwitchMatrix.get();

    public JServer(Socket socket) throws IOException {
        this.socket = socket;
        this.start();
    }
    
    void error(String str) throws ZError {
    	out.print("400 " + str + "\r\n");
    	out.flush();
    	System.out.println(""+connNum+" Error: 400 " + str);
    	throw new ZError("Client error " + str);
    }
    void internalError() {
    	out.print("500" + "\r\n");
    	out.flush();
    	System.out.println(""+connNum+" internal error");
    }
    
    void resp(Object str, int status) {
    	out.print("" + status + " " + str + "\r\n");
    	out.flush();
    	System.out.println(""+connNum+" Response: " + status + " " + str);
    }
    void resp(Object str) {
    	resp(str, 200);
    }
    void resp(long num) {
    	resp(new Long(num));
    }
    void ack() {
    	resp("", 200);
    }
    
    @Override
    public void run() {
        try {
			out = new PrintWriter(socket.getOutputStream(), true);
	        in = new BufferedReader(new InputStreamReader(socket.getInputStream()));
	        out.println("owo?");
	        {
	        	String first = in.readLine();
	        	if (!first.equals(version))
	        		error("Incorrect version "+first);
	        	out.println("200");
	        	while (this.handleCommand());
	        }
	        
		} catch (Exception e) {
			e.printStackTrace();
		} finally {
			try {
				this.socket.close();
			} catch (IOException e1) {
				e1.printStackTrace();
			}
		}
    }
    
	int curBoard = -1;
	Board[] boards = new Board[8];
	SatIO io = SatIO.get();
	String lastCommand = "";
    
    private boolean handleCommand() {
    	try {
    		String input = in.readLine().trim();
    		
			try {
				if (input.length() == 0)
					input = lastCommand;
				System.out.println("Received command '" + input + "'");
				int oldCurBoard = -2;
				if (input.matches("^\\d+:.*")) {
					String[] p = input.split(":", 2);
					input = p[1].trim();
					oldCurBoard = curBoard;
					curBoard = Integer.parseInt(p[0]);
					System.out.print("board "+curBoard+": ");
				}
				final String[] parts = input.split(" ");
				boolean success = (new Object() {
		    		void expect(int args) throws Exception {
						if (parts.length-1 < args) 
							error("Expected at least "+args+" arguments");
					}
		    		int num(int index) throws Exception {
						expect(index);
						try {
							int i = Integer.parseInt(parts[index]);
							return i;
						} catch (NumberFormatException e) {
							error("Expected number for argument "+index);
							return -1;
						}
					}
		    		byte byt(int index) throws Exception {
		    			int i = num(index);
		    			if ((i & 0xFFFFFF00) != 0)
		    				error("Expected argument "+index+" to be a byte");
		    			return (byte)i;
		    		}
		    		public boolean process() throws Exception {
		    			switch (parts[0]) {
						case "sw":
						case "switch-event":
							if (matrix.events.isEmpty())
								resp("empty");
							else {
								SwitchMatrix.Event e = matrix.events.remove();
								resp(e.toString(), matrix.events.isEmpty()? 200:201);
							}
							return true;
						case "sw-state":
							String response = "";
							int num = 0;
							for (int i=0; i<matrix.state.length; i++) {
								num = (num<<1)|(matrix.state[i]? 1:0);
								if ((i+1)%32 == 0) {
									response += num+" ";
									num = 0;
								}
							}
							resp(response);
							return true;
						case "s":
						case "select":
							curBoard = num(1);
							ack();
							return true;
						case "time":
							resp(new Date().getTime());
							return true;
						case "end":
						case "q":
				        	ack();
				        	System.out.println("Connection closed amicably");
							return false;
						case "kill":
							System.exit(0);
		    			}
		    			
		    			try {
			        		if (!SatIO.waitLock(10)) {
			        			error("Board busy");
			        		}
			    			switch (parts[0]) {
							case "i":
							case "init":
								expect(2);
								String type = parts[2];
								switch (type) {
								case "s16":
									boards[num(1)] = new Solenoid16(num(1));
									break;
								default:
									error("unknown board type");
								}
								curBoard = num(1);
								resp("init board "+num(1));
								return true;
							}
			    			if (curBoard != -1 && boards[curBoard] != null && boards[curBoard].type.equals(Board.Type.Solenoid16)) {
			    				Solenoid16 board = (Solenoid16)boards[curBoard];
			    				switch (parts[0]) {
			    				case "f":
			    				case "fire":
									if (parts.length > 2)
										board.fireSolenoidFor(byt(1), byt(2));
									else if (parts.length == 2)
										board.fireSolenoid(byt(1));
									else 
										error("usage: fire <num> [fire time]");
									resp("fired solenoid "+byt(1));
									return true;
			    				case "on":
									if (parts.length == 2)
										board.turnOnSolenoid(byt(1));
									else 
										error("usage: on <num>");
									resp("solenoid "+byt(1)+" on");
									return true;
			    				case "off":
									if (parts.length == 2)
										board.turnOffSolenoid(byt(1));
									else 
										error("usage: off <num>");
									resp("solenoid "+byt(1)+" off");
									return true;
								case "is":
								case "inits":
									switch (parts[1]) {
										case "m":
										case "momentary":
											if (parts.length > 3)
												board.initMomentary(byt(2), num(3));
											else if (parts.length > 2)
												board.initMomentary(byt(2));
											else 
												error("usage: init momentary <num> [fire time|50]");
											resp("solenoid "+byt(2)+" = momentary");
											break;
										case "oo":
										case "on-off":
											if (parts.length > 3)
												board.initOnOff(byt(2), num(3));
											else if (parts.length > 2)
												board.initOnOff(byt(2));
											else 
												error("usage: init on-off <num> [max on time|0]");
											resp("solenoid "+byt(2)+" = on-off");
											break;									
										case "i":
										case "input":
											if (parts.length > 3)
												board.initInput(byt(2), num(3));
											else if (parts.length > 2)
												board.initInput(byt(2));
											else 
												error("usage: init input <num> [settle time|30]");
											break;
										case "t":
										case "triggered":
											if (parts.length > 5)
												board.initTriggered(byt(2), byt(3), num(4), num(5));
											else if (parts.length > 4)
												board.initTriggered(byt(2), byt(3), num(4));
											else if (parts.length > 3)
												board.initTriggered(byt(2), byt(3));
											else 
												error("usage: init triggered <num> <triggered by> [min time|0] [max time|50]");
											break;
										default:
											error("unknown type '"+parts[1]+"'");
									}
									return true;
								case "d":
								case "disable":
									board.disableSolenoid(byt(1));
									resp("solenoid "+byt(1)+" disabled");
									return true;
			    				}
			    			}
							error("unknown command '"+parts[0]+"'");
							return true;
			    		} finally {
			    			SatIO.unlock();
			    		}
		    		}
		    	}).process();
				
				if (oldCurBoard != -2)
					curBoard = oldCurBoard;
				return success;
			} catch (ZError e) {
				return true;
			} catch (Exception e) {
				System.err.println("Error handling command: '" + input + "'");
				e.printStackTrace();
				internalError();
				return true;
			}
			finally {
				lastCommand = input;
			}
    	} catch (SocketException e) {
    		throw new RuntimeException(e);
		} catch (Exception e) {
			System.err.println("Error reading command");
			e.printStackTrace();
			internalError();
			return true;
		}
    }
    

    public static void main( String[] args) throws IOException
    {
    	matrix.start();
        ServerSocket socket = null;
        try {
            socket = new ServerSocket(2908);
            System.out.println( "Listening on port 2908..." );
            while(true) {
                Socket connection = socket.accept();
                System.out.println("New connection from " + connection.getInetAddress());
                new JServer(connection); 
            }
        } finally {
            socket.close();
        }
    }
}
