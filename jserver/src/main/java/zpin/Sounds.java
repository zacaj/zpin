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

import zpin.Sounds.Channel;

public class Sounds extends Thread {
	static class Channel {
		static int channelCount = 0;
		int num = ++Channel.channelCount;
		public float volume = 1;
		public Track track = null;
		
		public static Channel getFreeChannel() {
			for (int i=0; i<channels.length; i++) {
				if (channels[i].curPlay==null)
					return channels[i];
			}
			return null;
		}
		
		public Clip clip;
		
		public Play curPlay = null;
		
		public Channel() {
			
		}
		
	}
	static Channel[] channels = new Channel[16];
	
	static class Track {
		public Channel[] channels;
		public float volume = 1;
		public float duckVolume = 0.5f;
		public String name;
		public Track[] ducks = null; // duck this track when specified tracks are active
		public int muted = 0;
		
		public Track(Channel[] channels) {
			this.channels = channels;
			for (Channel c : channels)
				c.track = this;
		}
		
		public Channel getFreeChannel() {
			for (int i=0; i<this.channels.length; i++) {
				if (channels[i].curPlay==null)
					return channels[i];
			}
			return null;
		}
		
		public void stop() {
			for (Channel c : channels) {
				if (c.curPlay!=null && c.curPlay.playing)
					c.curPlay.stop();
			}
		}
	}
	
	static Track[] tracks = new Track[3];
	
	static class Play {
		static int playNum = 0;
		int num = ++Play.playNum;
		Wav wav;
		Channel channel;
		int loops = 0;
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
		public Play lastPlay = null;
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
		
		public Play play(Channel channel, float volume, boolean resume) throws LineUnavailableException, IOException, UnsupportedAudioFileException {
			if (this.curPlay != null && !this.curPlay.finished) {
				this.curPlay.stop();
			}
			this.curPlay = new Play(this, channel, volume);
			if (resume && this.lastPlay != null && !this.lastPlay.finished)
				this.curPlay.position = this.lastPlay.position;
			
			return this.lastPlay = this.curPlay;
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
		
		
	}
	
	public void init(boolean useDefault) {
		DataLine.Info lineInfo = new DataLine.Info(SourceDataLine.class, targetFormat);
		
		Mixer.Info[] infos = AudioSystem.getMixerInfo();
		Mixer.Info bestInfo = null;
		for (Mixer.Info info : infos) {
			System.out.println("Mixer: " + info);
			if (info.getName().toLowerCase().contains("device") && !useDefault) {
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
		
		int ci = 0;
		tracks[0] = new Track(new Channel[] {
				channels[ci++],
				channels[ci++],
		});
		tracks[0].name = "music";
		tracks[0].volume = 0.15f;
		tracks[0].duckVolume = 0.1f;
		
		tracks[1] = new Track(new Channel[] {
				channels[ci++],
				channels[ci++],
				channels[ci++],
				channels[ci++],
				channels[ci++],
				channels[ci++],
				channels[ci++],
				channels[ci++],
		});
		tracks[1].name = "effects";
		tracks[1].duckVolume = 0.8f;
		
		tracks[2] = new Track(new Channel[] {
				channels[ci++],
		});
		tracks[2].name = "voice";
		tracks[2].volume = 1.0f;
		
		tracks[0].ducks = new Track[] {
				tracks[2],
		};
		tracks[1].ducks = new Track[] {
				tracks[2],
		};
		
		String mediaDir = "./media";
		System.out.println("Loading sound files...");
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
//					System.out.println("Sound file '"+file.getName()+"' loaded successfully");
//					System.out.println("seconds: "+wav.length+" bits: "+wav.format.getSampleSizeInBits()+" hz: "+wav.format.getSampleRate()+" encoding: "+wav.format.getEncoding());
				} catch (UnsupportedAudioFileException | IOException | LineUnavailableException e) {
					System.out.println("ERROR loading sound file '"+file.getName());
					e.printStackTrace();
				}
			}
		}
		
		this.start();
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
							if (curPlay.loops-- == 0) {
								curPlay.completed();
								if (curPlay.wav.name.equals("green grass slow with start") || curPlay.wav.name.equals("green grass slow loop"))
									channel.curPlay = new Play(this.sounds.get("green grass slow loop").files.get(0), channel, curPlay.volume);
								if (curPlay.wav.name.equals("green grass solo with start") || curPlay.wav.name.equals("green grass solo loop"))
									channel.curPlay = new Play(this.sounds.get("green grass solo loop").files.get(0), channel, curPlay.volume);
							}
							else
								curPlay.position = 0;
						}
//						System.out.println(s+","+((double)s)*curPlay.volume);//+","+(short)(((double)s)*curPlay.volume));
						float volume = curPlay.volume;
						volume *= channel.volume;
						if (channel.track != null) {
							boolean ducked = false;
							if (channel.track.ducks != null)
								for (Track t : channel.track.ducks)
									for (Channel cc : t.channels)
										if (cc.curPlay != null && cc.curPlay.playing)
											ducked = true;
							volume *= !ducked? channel.track.volume : channel.track.duckVolume;
						}
						if (channel.track.muted>0)
							volume = 0;
						sample += ((double)s)*volume;
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

	public Play playSound(String name, int trackNum, float volume, boolean resume) throws Exception {
		long start = System.nanoTime();
		System.out.println(""+(Play.playNum+1)+"|?| "+start/1000000+": sound '"+name+"' requested (resume="+resume+")");
		Sound sound = this.sounds.get(name);
		if (sound == null)
			throw new Exception("sound '"+name+"' not found");
		if (resume && name.endsWith("with start")) {
			Sound loop = this.sounds.get(name.substring(0, name.length() - "with start".length())+"loop");
			Wav loopWav = loop.files.get(0);
			if (loopWav.curPlay != null && !loopWav.curPlay.finished) {
				sound = loop;
				System.out.println("swap for "+loop.name);
			}
		}
		
		Wav wav = sound.files.get((int) (Math.random()*sound.files.size()));
		Track track = this.tracks[trackNum];
		for (Channel c : track.channels) {
			if (c.curPlay!=null && c.curPlay.playing)
				if (new Date().getTime()-c.curPlay.startTime<50)// || c.curPlay.wav == wav)
					if (c.curPlay.wav.length > wav.length) {
						System.out.println(""+(Play.playNum+1)+"|?| "+System.nanoTime()/1000000+": skipping for "+c.curPlay.wav.name);
						return null;
					} else {
						System.out.println(""+(Play.playNum+1)+"|?| "+System.nanoTime()/1000000+": canceling "+c.curPlay.wav.name);
						c.curPlay.stop();
					}
		}
				
		Channel channel = track.getFreeChannel();
		if (channel == null) return null;
		Play play = wav.play(channel, volume, resume);
//		if (wav.name.equals("green grass slow with start"))
//			play.position = wav.data.length*95/100;
		System.out.println(""+play.num+"|"+play.channel.num+"| "+System.nanoTime()/1000000+": play sound '"+play.wav.name+"' on t "+trackNum+" c "+channel.num+" in "+(System.nanoTime()-start)/1000000);
		return play;
	}
	
	public void stopAll() {
		for (Track t : tracks)
			t.stop();
	}
}
