package zpin;

import com.github.mbelling.ws281x.LedStripType;
import com.github.mbelling.ws281x.Ws281xLedStrip;

public class LedManager extends Thread {
	Ws281xLedStrip strip;
	
	private static LedManager instance = null;
	public static LedManager get() {
		if (instance == null) {
			instance = new LedManager();
		}
		return instance;
	}
	
	public enum LedMode {
		Solid, Flashing, Pulsing,
	}
	
	public static class LedState {
		public int r,g,b;
		public LedMode mode;
		public double freq;
		public double phase;
	}
	
	public LedState[][] leds = new LedState[128][];
	
	public void init() {
		strip = new Ws281xLedStrip(128, 18, 800000, 10, 255, 0, false, LedStripType.WS2811_STRIP_GRB, true);
		strip.setStrip(0, 0, 0);
		strip.setPixel(109, 0, 255,0);
		strip.render();
		System.out.println("LEDs initialized");
	}
	
	@Override
    public void run() {
		while(true) {
			double now = SwitchMatrix.ms();
			for (int i=0; i<this.leds.length; i++) {
				LedState[] states = this.leds[i];
				if (states==null || states.length==0)
					strip.setPixel(i, 0, 0, 0);
				else {
					int j = ((int)now)/1000%states.length;
					LedState s = states[j];
					double t = now / (1000.f/s.freq);
					t = t - Math.floor(t);
					t += s.phase;
					if (t > 1) t -= 1;
					switch (s.mode) {
					case Solid:
						strip.setPixel(i, s.r, s.g, s.b);
						break;
					case Flashing:
						if (t >= .25 && t < 0.75)
							strip.setPixel(i, s.r, s.g, s.b);
						else
							strip.setPixel(i, 0, 0, 0);
						break;
					case Pulsing:
						t *= 2;
						if (t < 1) {
							strip.setPixel(i, (int)(s.r*t), (int)(s.g*t), (int)(s.b*t));
						}
						else {
							t = 2-t;
							strip.setPixel(i, (int)(s.r*t), (int)(s.g*t), (int)(s.b*t));
						}
						break;
					}
				}
			}
			strip.render();
			long took = (long) (SwitchMatrix.ms()-now);
			if (took < 33)
				try {
					Thread.sleep(33-took);
				} catch (InterruptedException e) {
					// TODO Auto-generated catch block
					e.printStackTrace();
				}
		}
	}

	public static void main(String[] args) {
//		WS2812.get();
	}

}
