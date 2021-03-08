package zpin;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.util.ArrayList;
import java.util.Date;
import java.util.HashMap;
import java.util.List;

import javax.sound.sampled.AudioFormat;
import javax.sound.sampled.AudioInputStream;
import javax.sound.sampled.AudioSystem;
import javax.sound.sampled.Clip;
import javax.sound.sampled.DataLine;
import javax.sound.sampled.LineUnavailableException;
import javax.sound.sampled.Mixer;
import javax.sound.sampled.SourceDataLine;
import javax.sound.sampled.UnsupportedAudioFileException;

public class Sounds extends Thread {
	static class Channel {
		static int channelCount = 0;
		int num = ++Channel.channelCount;
		
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
	static Channel[] channels = new Channel[16];
	
	
	static class Play {
		static int playNum = 0;
		int num = ++Play.playNum;
		Wav wav;
		Channel channel;
		boolean playing = true;
		boolean finished = false;
		float volume; // 0-1
		long startTime = new Date().getTime();
		
		int position = 0;
		
		public Play(Wav wav, Channel channel, float volume) {
			this.wav = wav;
			this.channel = channel;
			this.volume = volume;
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
		    	this.data[i/2] = (short)(((bytes[i+0] & 0xFF) << 8) | (bytes[i+1] & 0xFF));
		    this.length = this.data.length / format.getSampleRate();
		}
		
		public Play play(float volume) throws LineUnavailableException, IOException, UnsupportedAudioFileException {
			if (this.curPlay != null && !this.curPlay.finished) {
				this.curPlay.stop();
			}
			return this.curPlay = new Play(this, Channel.getFreeChannel(), volume);
		}
	}
	
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

	static AudioFormat targetFormat = new AudioFormat(44100, 16, 1, true, true);
	public static Sounds get() {
		if (instance == null) {
			instance = new Sounds();
		}
		return instance;
	}
	
	private Sounds() {
		DataLine.Info lineInfo = new DataLine.Info(SourceDataLine.class, targetFormat);
		
		Mixer.Info[] infos = AudioSystem.getMixerInfo();
		Mixer.Info bestInfo = null;
		for (Mixer.Info info : infos) {
			System.out.println("Mixer: " + info);
			if (info.getName().toLowerCase().contains("device")) {
				if (!AudioSystem.getMixer(info).isLineSupported(lineInfo))
					System.out.println("skipping, line doesn't support requested format");
				else {
					bestInfo = info;
					System.out.println("Selected");
				}
			}
		}
		
		try {
			if (bestInfo != null) {
				System.out.println("using preferred output "+bestInfo);
			}
			else if (!AudioSystem.isLineSupported(lineInfo)){
		         System.out.println("Line matching " + lineInfo + " is not supported.");
		         throw new Exception("could not init sound");
			} 
			else
				System.out.println("using default output");
			line = (SourceDataLine)(bestInfo!=null? 
					AudioSystem.getMixer(bestInfo).getLine(lineInfo) : AudioSystem.getLine(lineInfo));
			
			line.open(targetFormat, (int) (2*targetFormat.getSampleRate()*(50/1000.f)));
			line.start();
		} catch (Exception e1) {
			e1.printStackTrace();
			System.exit(1);
		}
		
		for (int i=0; i<channels.length; i++)
//			try {
				channels[i] = new Channel();
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
			int needed = line.available()/bytesPerSample;
			if (needed > line.getBufferSize()/bytesPerSample / 2)
			{
//				System.out.println("generate "+needed+" samples");
				buf.clear();
//				double t = 0;
				for (int i=0; i<needed; i++) {
					double sample = 0;
					for (int c=0; c<channels.length; c++) {
						Channel channel = channels[c];
						Play curPlay = channel.curPlay;
						if (curPlay==null || !curPlay.playing) continue;
						Wav wav = curPlay.wav;
						short s = wav.data[curPlay.position++];
						if (curPlay.position >= wav.data.length) {
							curPlay.completed();
						}
//						System.out.println(s+","+((double)s)*curPlay.volume);//+","+(short)(((double)s)*curPlay.volume));
						sample += ((double)s)*curPlay.volume;
					}
					short total;
					if (sample < Short.MIN_VALUE)
						total = Short.MIN_VALUE;
					else if (sample > Short.MAX_VALUE)
						total = Short.MAX_VALUE;
					else total = (short) sample;
					buf.putShort(total);
//					t+=sample;
				}
//				System.out.println("avg "+(t/needed));
				this.line.write(buf.array(), 0, buf.position());
			}
			try {
				Thread.sleep(5);
			} catch (InterruptedException e) {
			}   
		}
	}

	public Play playSound(String name, float volume) throws Exception {
		long start = System.nanoTime();
		System.out.println(""+(Play.playNum+1)+"|?| "+start/1000000+": sound '"+name+"' requested ");
		Sound sound = this.sounds.get(name);
		if (sound == null)
			throw new Exception("sound '"+name+"' not found");
		
		Wav wav = sound.files.get((int) (Math.random()*sound.files.size()));
		for (Channel c : channels) {
			if (c.curPlay!=null && c.curPlay.playing)
				if (new Date().getTime()-c.curPlay.startTime<50)
					if (c.curPlay.wav.length > wav.length) {
						System.out.println(""+(Play.playNum+1)+"|?| "+System.nanoTime()/1000000+": skipping for "+c.curPlay.wav.name);
						return null;
					} else {
						System.out.println(""+(Play.playNum+1)+"|?| "+System.nanoTime()/1000000+": canceling "+c.curPlay.wav.name);
						c.curPlay.stop();
					}
				
		}
		Play play = wav.play(volume);
		System.out.println(""+play.num+"|"+play.channel.num+"| "+System.nanoTime()/1000000+": play sound '"+play.wav.name+"' in "+(System.nanoTime()-start)/1000000);
		return play;
	}
	
}
