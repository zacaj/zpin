package zpin;

import java.io.File;
import java.io.IOException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;

import javax.sound.sampled.AudioFormat;
import javax.sound.sampled.AudioInputStream;
import javax.sound.sampled.AudioSystem;
import javax.sound.sampled.Clip;
import javax.sound.sampled.LineEvent;
import javax.sound.sampled.LineUnavailableException;
import javax.sound.sampled.UnsupportedAudioFileException;

public class Sounds {
	static class Play {
		static int playNum = 0;
		int num = ++Play.playNum;
		Wav wav;
		boolean playing = true;
		boolean finished = false;
		
		public Play(Wav wav) throws LineUnavailableException, IOException {
			this.wav = wav;
			this.wav.clip.setFramePosition(0);
			this.wav.clip.start();
		}
		
		public void stop() {
			this.playing = false;
			this.wav.clip.stop();
		}
	}
	
	static class Wav {
		public String name;
		public double length; // seconds
		public AudioInputStream stream;
		public Clip clip;
		public Play curPlay = null;
		
		public Wav(File file) throws UnsupportedAudioFileException, IOException, LineUnavailableException {
			this.name = file.getName().split("\\.")[0];
			this.stream = AudioSystem.getAudioInputStream(file);
		    AudioFormat format = this.stream.getFormat();
		    long audioFileLength = file.length();
		    int frameSize = format.getFrameSize();
		    float frameRate = format.getFrameRate();
		    this.length = (audioFileLength / (frameSize * frameRate));
			this.clip = AudioSystem.getClip();
			this.clip.open(stream);
			this.clip.addLineListener(e -> {
//				if (e.getType() == LineEvent.Type.START) {
//					this.curPlay = false;
//				}
				if (e.getType() == LineEvent.Type.STOP) {
					if (this.curPlay != null) {
						if (this.curPlay.playing) {
							this.curPlay.finished = true;
							this.curPlay.playing = false;
						}
					}
				}
			});
		}
		
		public Play play() throws LineUnavailableException, IOException {
			if (this.curPlay != null && !this.curPlay.finished)
				this.curPlay.stop();
			return this.curPlay = new Play(this);
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
	public static Sounds get() {
		if (instance == null) {
			instance = new Sounds();
		}
		return instance;
	}
	
	private Sounds() {
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
				} catch (UnsupportedAudioFileException | IOException | LineUnavailableException e) {
					System.out.println("ERROR loading sound file '"+file.getName());
					e.printStackTrace();
				}
			}
		}
	}

	public Play playSound(String name, float volume) throws Exception {
		Sound sound = this.sounds.get(name);
		if (sound == null)
			throw new Exception("sound '"+name+"' not found");
		
		Play play = sound.files.get(0).play();
		System.out.println("play sound '"+play.wav.name+"'");
		return play;
	}
	
}
