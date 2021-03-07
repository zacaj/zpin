package zpin;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.PrintWriter;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.SocketException;
import java.util.Arrays;

import zpin.LedManager.LedMode;
import zpin.LedManager.LedState;


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
    
    public PrintWriter logCmd = new PrintWriter("cmds.log");
    
    static SwitchMatrix matrix = SwitchMatrix.get();
    static Sounds sound = Sounds.get();
    static LedManager led = LedManager.get();
    
    public boolean isLive;

    public JServer(Socket socket, boolean isLive) throws IOException {
        this.socket = socket;
        this.isLive = isLive;
        this.start();
//        led.start();
    }
    
    String seqPrefix() {
    	if (seq != 0) return "#"+seq+" ";
    	return "";
    }
    
    void error(String str) throws ZError {
    	out.print(seqPrefix()+"400 " + str + "\r\n");
    	out.flush();
    	logCmd.println(""+connNum+" Error: 400 " + str);
    	throw new ZError("Client error " + str);
    }
    void internalError() {
    	out.print(seqPrefix()+"500" + "\r\n");
    	out.flush();
    	logCmd.println(""+connNum+" internal error");
    }
    
    void resp(Object str, int status) {
    	out.print(seqPrefix()+"" + status + " " + str + "\r\n");
    	out.flush();
    	logCmd.println(""+connNum+" Response: " + status + " " + str);
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
	        	seq = 0;
	    		if ( first.startsWith("#")) {
	    			String[] p = first.split(" ", 2);
	    			seq = Integer.parseInt(p[0].substring(1));
	    			first = p[1];
	    		}
	        	if (!first.equals(version))
	        		error("Incorrect version "+first);
	        	out.println((seq!=0? "#"+seq+" ":"")+"200 "+(this.isLive?"live":"sim"));
	        	while (this.handleCommand());
	        }
	        
		} catch (Exception e) {
			System.out.println("connection fatal error: ");
			e.printStackTrace();
		} finally {
			try {
				this.socket.close();
				System.out.println("connection closed");
			} catch (IOException e1) {
				System.out.println("error closing connection");
				e1.printStackTrace();
			}
		}
    }
    
	int curBoard = -1;
	static Board[] boards = new Board[8];
	SatIO io = SatIO.get();
	String lastCommand = "";
	int seq = 0;
    
    private boolean handleCommand() {
    	try {
    		String input = in.readLine();
    		if (input == null) return false;
    		input = input.trim();
    		
    		seq = 0;
    		if ( input.startsWith("#")) {
    			String[] p = input.split(" ", 2);
    			seq = Integer.parseInt(p[0].substring(1));
    			input = p[1];
    		}
    		
    			
			try {
				if (input.length() == 0)
					input = lastCommand;
				logCmd.println("Received command '" + input + "'");
				int oldCurBoard = -2;
				if (input.matches("^\\d+:.*")) {
					String[] p = input.split(":", 2);
					input = p[1].trim();
					oldCurBoard = curBoard;
					curBoard = Integer.parseInt(p[0]);
					logCmd.print("board "+curBoard+": ");
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
//							SwitchMatrix.lock();
							try {
								if (matrix.events.isEmpty())
									resp("empty");
								else {
									String events = "";
									while (!matrix.events.isEmpty()) {
										events += matrix.events.remove().toString();
										if (!matrix.events.isEmpty()) events += ";";
									}
									resp(events, 200);
								}
							}
							finally {
//								SwitchMatrix.unlock();
							}
							return true;
						case "sw-state":
							String response = "";
							int num = 0;
							for (int i=0; i<matrix.switches.length; i++) {
								num = (num<<1)|(matrix.switches[i].state? 1:0);
								if ((i+1)%32 == 0) {
									response += num+" ";
									num = 0;
								}
							}
							resp(response);
							return true;
						case "sw-config":
							if (parts.length != 5)
								error("usage: sw-config row col minOnTime minOffTime");
							int row = num(1);
							int col = num(2);
							int minOnTime = num(3);
							int minOffTime = num(4);
							matrix.switches[row*matrix.Width+col].minOnTime = minOnTime;
							matrix.switches[row*matrix.Width+col].minOffTime = minOffTime;
							System.out.println("Configure switch "+row+","+col);
							ack();
							return true;
						case "sound":
							if (parts.length < 3)
								error("usage: sound volume name ");
							int volume = num(1);
							Sounds.Play play = sound.playSound(String.join(" ", Arrays.asList(parts).subList(2, parts.length)), ((float)volume)/100);
							if (play != null)
								resp(play.num);
							else
								resp(201);
							return true;
						case "light":
							if (parts.length < 7)
								error("usage: light stateCount ledNum hex solid|flashing|pulsing frequency phase [hex sol...]");
							int stateCount = num(1);
							int n = num(2);
							int j = 3;
							LedState[] states = new LedState[stateCount];
							for (int i=0; i<stateCount; i++) {
								LedState state = new LedState();
								String hex = parts[j++];
								if (hex.startsWith("#")) hex = hex.substring(1);
								String modeStr = parts[j++];
								state.freq = Double.parseDouble(parts[j++]);
								state.phase = Double.parseDouble(parts[j++]);
								state.r = Integer.valueOf(hex.substring(0,2), 16);
								state.g = Integer.valueOf(hex.substring(2,4), 16);
								state.b = Integer.valueOf(hex.substring(4,6), 16);
//								System.out.println("r "+state.r+" g "+state.g+" b "+state.b);
								if (modeStr.equals("solid"))
									state.mode = LedMode.Solid;
								if (modeStr.equals("flashing"))
									state.mode = LedMode.Flashing;
								if (modeStr.equals("pulsing"))
									state.mode = LedMode.Pulsing;
								states[i] = state;
							}
							led.leds[n] = states;
							ack();
							return true;
						case "s":
						case "select":
							curBoard = num(1);
							ack();
							return true;
						case "time":
							resp(SwitchMatrix.ms());
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
										board.fireSolenoidFor(byt(1), num(2));
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
			    				case "toggle":
									if (parts.length == 2)
										board.toggleSolenoid(byt(1));
									else 
										error("usage: toggle <num>");
									resp("solenoid "+byt(1)+(board.state[byt(1)]? " on":" off"));
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
											if (parts.length == 6)
												board.initOnOff(byt(2), num(3), byt(4), byt(5));
											else if (parts.length == 5)
												board.initOnOff(byt(2), num(3), byt(4));
											else if (parts.length == 4)
												board.initOnOff(byt(2), num(3));
											else if (parts.length == 3)
												board.initOnOff(byt(2));
											else 
												error("usage: init on-off <num> [max on time|0] [pulseOffTime|0]");
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
    	} catch (SocketException|RuntimeException e) {
            led.clear();
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
    	sound.start();
    	led.init();
//    	try {
//			sound.playSound("shoot the ball carefully", 1);
//		} catch (Exception e) {
//			// TODO Auto-generated catch block
//			e.printStackTrace();
//		}
        ServerSocket socket = null;
        try {
            socket = new ServerSocket(2908);
            System.out.println( "Listening on port 2908..." );
            while(true) {
                Socket connection = socket.accept();
                System.out.println("New connection from " + connection.getInetAddress());
                new JServer(connection, args.length==0 || !args[0].equals("sim")); 
            }
        } finally {
        	System.out.println("No longer listening");
            socket.close();
        }
    }
}
