package zpin;

import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.ShortBuffer;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;

import javax.sound.sampled.AudioFormat;
import javax.sound.sampled.AudioInputStream;
import javax.sound.sampled.AudioSystem;
import javax.sound.sampled.Clip;
import javax.sound.sampled.DataLine;
import javax.sound.sampled.LineEvent;
import javax.sound.sampled.LineUnavailableException;
import javax.sound.sampled.SourceDataLine;
import javax.sound.sampled.UnsupportedAudioFileException;

public class Sounds extends Thread {
	static class Channel {
		static int channelCount = 0;
		int num = ++Channel.channelCount;
		
		static Channel[] channels = new Channel[4];
		public static Channel getFreeChannel() {
			for (int i=0; i<channels.length; i++) {
				if (channels[i].curPlay==null)
					return channels[i];
			}
			throw new RuntimeException("no free channels");
		}
		
		public Clip clip;
		
		public Play curPlay = null;
		
		public Channel() {
			
		}
		
	}
	
	
	static class Play {
		static int playNum = 0;
		int num = ++Play.playNum;
		Wav wav;
		Channel channel;
		boolean playing = true;
		boolean finished = false;
		
		int position = 0;
		
		public Play(Wav wav, Channel channel) {
			this.wav = wav;
			this.channel = channel;
			this.channel.curPlay = this;
			System.out.println(""+this.num+"|"+this.channel.num+"| started");
		}
		
		public void stop() {
			this.playing = false;
			System.out.println(""+this.num+"|"+this.channel.num+"| stopped");
			this.channel.curPlay = null;
			this.wav.curPlay = null;
		}

		public void completed() {
			this.finished = true;
			this.playing = false;
			System.out.println(""+this.num+"|"+this.channel.num+"| completed");
			this.channel.curPlay = null;
			this.wav.curPlay = null;
		}
	}
	
	static class Wav {
		public String name;
		public double length; // seconds
		public Play curPlay = null;
		public File file;
		private AudioFormat format;
		public short[] data;
		
		public Wav(File file) throws UnsupportedAudioFileException, IOException, LineUnavailableException {
			this.name = file.getName().split("\\.")[0];
			this.file = file;
	
			AudioInputStream oStream = AudioSystem.getAudioInputStream(file);
			AudioInputStream stream = AudioSystem.getAudioInputStream(targetFormat, oStream);
		    format = stream.getFormat();
//		    long audioFileLength = file.length();
//		    int frameSize = format.getFrameSize();
//		    float frameRate = format.getFrameRate();
//		    this.length = (audioFileLength / (frameSize * frameRate));
		    
		    ByteArrayOutputStream buffer = new ByteArrayOutputStream();
		    int nRead;
		    byte[] data = new byte[1024];
		    while ((nRead = stream.read(data, 0, data.length)) != -1) {
		        buffer.write(data, 0, nRead);
		    }
		 
		    buffer.flush();
		    byte[] bytes = buffer.toByteArray();
		    this.data = new short[bytes.length/2];
		    for (int i=0; i<bytes.length; i+=2)
		    	this.data[i/2] =  (short) ((((short)bytes[i+0])<<8)|((short)bytes[i+1]));
		    this.length = this.data.length / format.getSampleRate();
		}
		
		public Play play() throws LineUnavailableException, IOException, UnsupportedAudioFileException {
			if (this.curPlay != null && !this.curPlay.finished) {
				this.curPlay.stop();
			}
			return this.curPlay = new Play(this, Channel.getFreeChannel());
		}
	}
//	
//	static class Channel {
//		static int channelCount = 0;
//		int num = ++Channel.channelCount;
//		
//		static Channel[] channels = new Channel[4];
//		public static Channel getFreeChannel() {
//			for (int i=0; i<channels.length; i++) {
//				if (channels[i].curPlay==null)
//					return channels[i];
//			}
//			throw new RuntimeException("no free channels");
//		}
//		
//		public Clip clip;
//		
//		public Play curPlay = null;
//		
//		public Channel() throws LineUnavailableException {
//			this.clip = AudioSystem.getClip();
//			
//			this.clip.addLineListener(e -> {
////				if (e.getType() == LineEvent.Type.START) {
////					this.curPlay = false;
////				}
//				if (e.getType() == LineEvent.Type.STOP) {
//					if (this.curPlay != null) {
//						System.out.println(""+this.curPlay.num+"|"+this.num+"| "+System.nanoTime()/1000000+": stop heard");
//						if (this.curPlay.playing) {
//							this.curPlay.finished = true;
//							this.curPlay.playing = false;
//						}
//						this.clip.close();
//						System.out.println(""+this.curPlay.num+"|"+this.num+"| "+System.nanoTime()/1000000+": clip closed");
//						this.curPlay.wav.curPlay = null;
//						this.curPlay = null;
//					}
//				}
//			});
//		}
//	}
//	
//	static class Play {
//		static int playNum = 0;
//		int num = ++Play.playNum;
//		Wav wav;
//		Channel channel;
//		boolean playing = true;
//		boolean finished = false;
//		
//		public Play(Wav wav, Channel channel) throws LineUnavailableException, IOException, UnsupportedAudioFileException {
//			this.wav = wav;
//			this.channel = channel;
//			this.channel.curPlay = this;
//			System.out.println(""+this.num+"|"+this.channel.num+"| "+System.nanoTime()/1000000+": make stream ");
//			wav.stream = AudioSystem.getAudioInputStream(wav.file);
//			System.out.println(""+this.num+"|"+this.channel.num+"| "+System.nanoTime()/1000000+": loaded ");
//			channel.clip.open(wav.stream);
//			System.out.println(""+this.num+"|"+this.channel.num+"| "+System.nanoTime()/1000000+": opened ");
//			channel.clip.setFramePosition(0);
//			channel.clip.start();
//			System.out.println(""+this.num+"|"+this.channel.num+"| "+System.nanoTime()/1000000+": started ");
//		}
//		
//		public void stop() {
//			this.playing = false;
//			this.channel.clip.stop();
//			System.out.println(""+this.num+"|"+this.channel.num+"| "+System.nanoTime()/1000000+": clip stopped");
////			this.wav.curPlay = null;
////			this.channel.clip.close();
////			System.out.println("clip closed at "+System.nanoTime()/1000000);
////			this.channel.curPlay = null;
//		}
//	}
//	
//	static class Wav {
//		public String name;
//		public double length; // seconds
//		public AudioInputStream stream;
//		public Play curPlay = null;
//		public File file;
//		
//		public Wav(File file) throws UnsupportedAudioFileException, IOException, LineUnavailableException {
//			this.name = file.getName().split("\\.")[0];
//			this.file = file;
////			BufferedInputStream myStream = new BufferedInputStream(new FileInputStream(file)); 
////			myStream.mark(0);
//			this.stream = AudioSystem.getAudioInputStream(file);
//		    AudioFormat format = this.stream.getFormat();
//		    long audioFileLength = file.length();
//		    int frameSize = format.getFrameSize();
//		    float frameRate = format.getFrameRate();
//		    this.length = (audioFileLength / (frameSize * frameRate));
//		}
//		
//		public Play play() throws LineUnavailableException, IOException, UnsupportedAudioFileException {
//			if (this.curPlay != null && !this.curPlay.finished) {
//				this.curPlay.stop();
//				System.out.println("stopped at "+System.nanoTime()/1000000);
//			}
//			return this.curPlay = new Play(this, Channel.getFreeChannel());
//		}
//	}
//	
	static class Sound {
		public String name;
		public List<Wav> files = new ArrayList<Wav>();
		public Sound(String name) {
			this.name = name;
		}
	}
	
	HashMap<String, Sound> sounds = new HashMap<String, Sound>();

	private static Sounds instance = null;

	private SourceDataLine line;

	static AudioFormat targetFormat = new AudioFormat(44100, 16, 1, true, false);
	public static Sounds get() {
		if (instance == null) {
			instance = new Sounds();
		}
		return instance;
	}
	
	private Sounds() {
		DataLine.Info info = new DataLine.Info(SourceDataLine.class, targetFormat);
		
		try {
			if (!AudioSystem.isLineSupported(info)){
		         System.out.println("Line matching " + info + " is not supported.");
		         throw new Exception("could not init sound");
			}
			line = (SourceDataLine)AudioSystem.getLine(info);
			line.open(targetFormat, 2*24000/50);
			line.start();
		} catch (Exception e1) {
			e1.printStackTrace();
			System.exit(1);
		}
		
		for (int i=0; i<Channel.channels.length; i++)
//			try {
				Channel.channels[i] = new Channel();
//			} catch (LineUnavailableException e) {
//				System.out.println("ERROR: Failed to open channel "+i);
//				e.printStackTrace();
//			}
		
		String mediaDir = "./media";
		File[] files = new File(mediaDir).listFiles();
		for (File file : files) {
			if (file.isFile() && file.getName().endsWith(".wav")) {
				String[] parts = file.getName().split("\\.")[0].split("_");
				String name = parts[0];
				try {
					Wav wav = new Wav(file);
					if (!sounds.containsKey(parts[0]))
						sounds.put(name, new Sound(name));
					sounds.get(name).files.add(wav);
					System.out.println("Sound file '"+file.getName()+"' loaded successfully");
					System.out.println("seconds: "+wav.length+" bits: "+wav.format.getSampleSizeInBits()+" hz: "+wav.format.getSampleRate()+" encoding: "+wav.format.getEncoding());
				} catch (UnsupportedAudioFileException | IOException | LineUnavailableException e) {
					System.out.println("ERROR loading sound file '"+file.getName());
					e.printStackTrace();
				}
			}
		}
		
	}
	
	public void run() {
		int bytesPerSample = line.getFormat().getSampleSizeInBits()/8;
		ByteBuffer buf = ByteBuffer.allocate(line.getBufferSize());
		while (true) {
			buf.clear();
			int needed = line.available()/bytesPerSample;
			for (int i=0; i<needed; i++) {
				double sample = 0;
				for (int c=0; c<Channel.channels.length; c++) {
					Channel channel = Channel.channels[c];
					if (channel.curPlay==null || !channel.curPlay.playing) continue;
					Wav wav = channel.curPlay.wav;
					short s = wav.data[channel.curPlay.position++];
					if (channel.curPlay.position >= wav.data.length) {
						channel.curPlay.completed();
					}
					sample += ((double)s);
				}
				short total;
				if (sample < Short.MIN_VALUE)
					total = Short.MIN_VALUE;
				else if (sample > Short.MAX_VALUE)
					total = Short.MAX_VALUE;
				else total = (short) sample;
				buf.putShort(total);
			}
			this.line.write(buf.array(), 0, buf.position());
		}
	}

	public Play playSound(String name, float volume) throws Exception {
		long start = System.nanoTime();
		System.out.println(""+(Play.playNum+1)+"|?| "+start/1000000+": sound requested ");
		Sound sound = this.sounds.get(name);
		if (sound == null)
			throw new Exception("sound '"+name+"' not found");
		
		Play play = sound.files.get(0).play();
		System.out.println(""+play.num+"|"+play.channel.num+"| "+System.nanoTime()/1000000+": play sound '"+play.wav.name+"' in "+(System.nanoTime()-start)/1000000);
		return play;
	}
	
}
