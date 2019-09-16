package zpin;
import java.net.*;
import java.util.Date;
import java.util.function.Consumer;
import java.util.function.Function;
import java.io.*;


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

    public JServer(Socket socket) throws IOException {
        this.socket = socket;
        this.start();
    }
    
    void error(String str) throws Exception {
    	out.print("400 " + str + "\r\n");
    	System.out.println(""+connNum+" Error: 400 " + str);
    	throw new Exception("Client error " + str);
    }
    void internalError() {
    	out.print("500" + "\r\n");
    	System.out.println(""+connNum+" internal error");
    }
    
    void resp(Object str, int status) {
    	out.print("" + status + " " + str + "\r\n");
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
    
    private boolean handleCommand() {
    	try {
    		String input = in.readLine();
			try {
				System.out.println("Received command '" + input + "'");
				String[] parts = input.split(" ");
				return (new Object() {
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
						case "s":
						case "select":
							curBoard = num(1);
							return true;
						case "time":
							resp(new Date().getTime());
							return true;
						case "q":
						case "quit":
				        	ack();
				        	System.out.println("Connection closed amicably");
							return false;
						}
		    			if (curBoard != -1 && boards[curBoard].type.equals(Board.Type.Solenoid16)) {
		    				Solenoid16 board = (Solenoid16)boards[curBoard];
		    				switch (parts[0]) {
		    				case "f":
		    				case "fire":
								if (parts.length >= 2)
									board.fireSolenoidFor(byt(1), byt(2));
								else
									board.fireSolenoid(byt(1));
								return true;
							case "i":
							case "init":
								switch (parts[1]) {
									case "m":
									case "momentary":
										if (parts.length > 3)
											board.initMomentary(byt(2), num(3));
										else if (parts.length > 2)
											board.initMomentary(byt(2));
										else 
											error("usage: init momentary <num> [fire time|50]");
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
								break;
		    				}
		    			}
						error("unknown command '"+parts[0]+"'");
						return true;
		    		}
		    	}).process();
			} catch (Exception e) {
				System.err.println("Error handling command: '" + input + "'");
				e.printStackTrace();
				internalError();
				return true;
			}
		} catch (IOException e) {
			System.err.println("Error reading command");
			e.printStackTrace();
			internalError();
			return true;
		}
    }
    

    public static void main( String[] args ) throws IOException
    {
        ServerSocket socket = null;
        try {
            socket = new ServerSocket(2908);
            System.out.println( "Listening on port 2908" );
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
