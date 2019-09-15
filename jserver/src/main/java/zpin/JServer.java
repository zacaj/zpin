package zpin;
import java.net.*;
import java.util.Date;
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
    
    private boolean handleCommand() {
    	try {
    		String input = in.readLine();
			try {
				System.out.println("Received command '" + input + "'");
				String[] parts = input.split(" ");
				switch (parts[0]) {
				case "time":
					resp(new Date().getTime());
					break;
				case "q":
				case "quit":
		        	ack();
		        	System.out.println("Connection closed amicably");
					return false;
				}
				return true;
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
