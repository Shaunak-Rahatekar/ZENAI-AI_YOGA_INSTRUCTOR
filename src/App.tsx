/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  GoogleAuthProvider, 
  User as FirebaseUser,
  signOut
} from 'firebase/auth';
import { 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  collection, 
  addDoc, 
  query, 
  orderBy, 
  limit, 
  getDocs,
  Timestamp
} from 'firebase/firestore';
import { auth, db } from './lib/firebase';
import { 
  generateYogaRoutine, 
  generateMeditationAudio, 
  generatePoseAudio, 
  analyzePosture, 
  generateGrowthReport,
  type YogaRoutine,
  type GrowthReport
} from './lib/gemini';
import { cn } from './lib/utils';
import { 
  Flame, 
  User, 
  Calendar, 
  Play, 
  ChevronRight, 
  ArrowLeft, 
  Camera, 
  CheckCircle2,
  Settings,
  LogOut,
  Dumbbell,
  AlertCircle,
  Activity,
  History,
  Sparkles,
  Waves,
  Heart
} from 'lucide-react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import { format, differenceInDays, isToday, parseISO, subDays } from 'date-fns';

interface UserData {
  age: number;
  weight: number;
  height: number;
  bmi: number;
  streakCount: number;
  lastWorkoutDate: string | null;
  reminderTime: string;
}

type ViewState = 'landing' | 'onboarding' | 'dashboard' | 'workout' | 'meditation' | 'settings' | 'growth-report';

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [sessionHistory, setSessionHistory] = useState<any[]>([]);
  const [view, setView] = useState<ViewState>('landing');
  const [routine, setRoutine] = useState<YogaRoutine | null>(null);
  const [generating, setGenerating] = useState(false);
  const [currentGrowthReport, setCurrentGrowthReport] = useState<GrowthReport | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
        
        // Fetch session history for the dashboard chart
        const q = query(collection(db, 'users', currentUser.uid, 'sessions'), orderBy('completedAt', 'desc'), limit(10));
        const historySnap = await getDocs(q);
        setSessionHistory(historySnap.docs.map(d => ({ id: d.id, ...d.data() })));

        if (userDoc.exists()) {
          const data = userDoc.data() as UserData;
          setUserData(data);
          setView('dashboard');
        } else {
          setView('onboarding');
        }
      } else {
        setView('landing');
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login failed:", error);
    }
  };

  const handleOnboarding = async (data: { age: number; height: number; weight: number }) => {
    if (!user) return;
    const bmi = data.weight / ((data.height / 100) ** 2);
    const newUserData: UserData = {
      ...data,
      bmi,
      streakCount: 0,
      lastWorkoutDate: null,
      reminderTime: '08:00'
    };
    await setDoc(doc(db, 'users', user.uid), newUserData);
    setUserData(newUserData);
    setView('dashboard');
  };

  const startWorkout = async () => {
    if (!userData) return;
    setGenerating(true);
    try {
      const newRoutine = await generateYogaRoutine(userData.age, userData.bmi);
      setRoutine(newRoutine);
      setView('workout');
    } catch (error) {
      console.error("Failed to generate routine:", error);
      alert("Failed to generate your personalized flow. Please check your connection and try again.");
    } finally {
      setGenerating(false);
    }
  };

  const completeWorkout = async (insights: string[]) => {
    if (!user || !userData) return;
    
    setGenerating(true); 
    try {
      // Phase 1: Update streak and stats
      let newStreak = userData.streakCount;
      const lastDate = userData.lastWorkoutDate ? parseISO(userData.lastWorkoutDate) : null;
      const today = new Date();

      if (!lastDate || differenceInDays(today, lastDate) === 1) {
        newStreak += 1;
      } else if (differenceInDays(today, lastDate) > 1) {
        newStreak = 1;
      }

      const updatedData = {
        ...userData,
        streakCount: newStreak,
        lastWorkoutDate: format(today, 'yyyy-MM-dd')
      };

      await updateDoc(doc(db, 'users', user.uid), {
        streakCount: updatedData.streakCount,
        lastWorkoutDate: updatedData.lastWorkoutDate
      });
      
      const sessionDuration = routine?.poses.reduce((acc, p) => acc + p.duration, 0) || 0;
      await addDoc(collection(db, 'users', user.uid, 'sessions'), {
        workoutName: routine?.name || 'Daily Flow',
        completedAt: Timestamp.now(),
        duration: sessionDuration
      });

      // Phase 2: Generate Growth Report
      const report = await generateGrowthReport(insights.length > 0 ? insights : ["Consistency was excellent.", "Good flow maintained."]);
      setCurrentGrowthReport(report);
      
      setUserData(updatedData);
      
      // Refresh history for dashboard
      const q = query(collection(db, 'users', user.uid, 'sessions'), orderBy('completedAt', 'desc'), limit(10));
      const historySnap = await getDocs(q);
      setSessionHistory(historySnap.docs.map(d => ({ id: d.id, ...d.data() })));
      
      setView('growth-report');
    } catch (error) {
      console.error("Failed to complete workout:", error);
      alert("Submission failed. Please check your connection.");
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-brand-bg">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
          className="w-12 h-12 border-4 border-brand-primary border-t-transparent rounded-full"
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen max-w-md mx-auto relative overflow-hidden bg-brand-bg shadow-xl flex flex-col">
      <AnimatePresence mode="wait">
        {view === 'landing' && <LandingView onLogin={handleLogin} />}
        {view === 'onboarding' && <OnboardingView onComplete={handleOnboarding} />}
        {view === 'dashboard' && (
          <DashboardView 
            user={userData!} 
            history={sessionHistory}
            onStart={startWorkout} 
            onOpenSettings={() => setView('settings')}
            onOpenMeditation={() => setView('meditation')}
            generating={generating}
          />
        )}
        {view === 'workout' && routine && (
          <WorkoutView 
            routine={routine} 
            onCancel={() => setView('dashboard')} 
            onComplete={completeWorkout}
          />
        )}
        {view === 'meditation' && (
          <MeditationView 
            onBack={() => setView('dashboard')}
          />
        )}
        {view === 'growth-report' && currentGrowthReport && (
          <GrowthReportView 
            report={currentGrowthReport}
            onClose={() => setView('dashboard')}
          />
        )}
        {view === 'settings' && (
          <SettingsView 
            user={userData!} 
            onBack={() => setView('dashboard')}
            onUpdate={async (data) => {
              if (user && userData) {
                const newData = { ...userData, ...data };
                if (data.height !== undefined || data.weight !== undefined) {
                  newData.bmi = newData.weight / ((newData.height / 100) ** 2);
                }
                await updateDoc(doc(db, 'users', user.uid), newData as any);
                setUserData(newData);
              }
            }}
            onLogout={async () => {
              await signOut(auth);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// --- Views ---

function LandingView({ onLogin }: { onLogin: () => void }) {
  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex-1 flex flex-col justify-center items-center p-12 text-center"
    >
      <div className="w-24 h-24 border border-brand-border rounded-full flex items-center justify-center mb-10">
        <div className="w-16 h-16 bg-brand-primary rounded-full flex items-center justify-center shadow-sm">
          <Dumbbell className="text-white w-6 h-6" />
        </div>
      </div>
      <span className="label-xs mb-3">Personal AI Yoga Instructor</span>
      <h1 className="text-6xl mb-6 italic">ZenAI</h1>
      <p className="text-sm opacity-60 mb-12 max-w-[240px] leading-relaxed italic">
        A sanctuary for personalized mindful practice, tailored to your unique biology.
      </p>
      <button 
        onClick={onLogin}
        className="w-full bg-brand-primary text-white py-5 rounded-full text-xs uppercase tracking-[0.3em] font-semibold hover:shadow-lg transition-all flex items-center justify-center gap-3"
      >
        <img src="https://www.google.com/favicon.ico" className="w-4 h-4 invert" alt="Google" referrerPolicy="no-referrer" />
        Enter Sanctuary
      </button>
    </motion.div>
  );
}

function OnboardingView({ onComplete }: { onComplete: (data: { age: number; height: number; weight: number }) => void }) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({ age: 25, height: 170, weight: 65 });

  const steps = [
    { label: "Your Age", key: "age", min: 10, max: 100, unit: "Years" },
    { label: "Your Height", key: "height", min: 100, max: 250, unit: "cm" },
    { label: "Your Weight", key: "weight", min: 30, max: 200, unit: "kg" }
  ] as const;

  const current = steps[step];

  return (
    <motion.div 
      initial={{ x: 20, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: -20, opacity: 0 }}
      className="flex-1 flex flex-col p-10 pt-16"
    >
      <div className="mb-12">
        <div className="flex gap-1 mb-3">
          {steps.map((_, i) => (
            <div key={i} className={cn("h-[1px] flex-1 bg-brand-border overflow-hidden")}>
              <div className={cn("h-full bg-brand-primary transition-all duration-700", i <= step ? "w-full" : "w-0")} />
            </div>
          ))}
        </div>
        <span className="label-xs">Profile Creation — {step + 1} / 3</span>
      </div>

      <h2 className="text-5xl mb-12 italic">{current.label}</h2>

      <div className="flex-1 flex flex-col justify-center items-center gap-10">
        <div className="text-7xl font-light italic flex items-baseline gap-3 text-brand-primary">
          {form[current.key]}
          <span className="text-lg font-sans text-brand-ink/40 font-normal uppercase tracking-widest">{current.unit}</span>
        </div>
        <input 
          type="range"
          min={current.min}
          max={current.max}
          value={form[current.key]}
          onChange={(e) => setForm({ ...form, [current.key]: parseInt(e.target.value) })}
          className="w-full accent-brand-primary h-px bg-brand-border appearance-none cursor-pointer"
        />
      </div>

      <button 
        onClick={() => {
          if (step < steps.length - 1) setStep(step + 1);
          else onComplete(form);
        }}
        className="mt-12 w-full bg-brand-primary text-white py-5 rounded-full text-xs uppercase tracking-[0.3em] font-semibold transition-all flex items-center justify-center gap-2"
      >
        {step === steps.length - 1 ? 'Begin Practice' : 'Continue'}
        <ChevronRight className="w-4 h-4 opacity-50" />
      </button>
    </motion.div>
  );
}

function DashboardView({ user, history, onStart, onOpenSettings, onOpenMeditation, generating }: { user: UserData; history: any[]; onStart: () => void; onOpenSettings: () => void; onOpenMeditation: () => void; generating: boolean }) {
  // Generate robust chart data from history
  const chartData = [...Array(7)].map((_, i) => {
    const d = subDays(new Date(), 6 - i);
    const dateStr = format(d, 'MMM dd');
    const session = history.find(s => {
      const completedAt = s.completedAt?.toDate ? s.completedAt.toDate() : (s.completedAt?.seconds ? new Date(s.completedAt.seconds * 1000) : null);
      return completedAt && format(completedAt, 'MMM dd') === dateStr;
    });
    return {
      name: dateStr,
      minutes: session ? session.duration / 60 : 0
    };
  });

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex-1 flex flex-col p-8 bg-aura overflow-y-auto"
    >
      <header className="flex justify-between items-start mb-10">
        <div>
          <span className="label-xs text-brand-primary block mb-2">Sanctuary Presence</span>
          <h1 className="text-4xl italic">Welcome, {auth.currentUser?.displayName?.split(' ')[0] || 'Seeker'}</h1>
        </div>
        <button 
          onClick={onOpenSettings} 
          className="p-3 glass rounded-full hover:bg-white/60 transition-all shadow-sm"
        >
          <Settings className="w-5 h-5 text-brand-ink/40" />
        </button>
      </header>

      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="col-span-2 glass p-6 rounded-[32px] overflow-hidden">
          <div className="flex justify-between items-baseline mb-6">
            <h3 className="text-xl italic">Activity Rhythm</h3>
            <span className="label-xs !opacity-40">Past 7 Days</span>
          </div>
          <div className="h-32 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorMin" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#5A5A40" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#5A5A40" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <Area type="monotone" dataKey="minutes" stroke="#5A5A40" fillOpacity={1} fill="url(#colorMin)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="glass p-6 rounded-[32px] flex flex-col justify-between aspect-square">
          <p className="label-xs">Zen Status</p>
          <div>
            <p className="text-5xl font-serif text-brand-primary mb-1">{user.streakCount}</p>
            <p className="text-[10px] uppercase tracking-widest opacity-60">Day Streak</p>
          </div>
          <div className="w-8 h-[1px] bg-brand-primary/20" />
        </div>

        <div className="glass p-6 rounded-[32px] flex flex-col justify-between aspect-square bg-[#E8E8E0]">
          <p className="label-xs">BIOLOGY</p>
          <div>
            <p className="text-4xl font-serif mb-1">{user.bmi.toFixed(1)}</p>
            <p className="text-[10px] uppercase tracking-widest opacity-60">Calculated BMI</p>
          </div>
          <Heart className="w-5 h-5 text-brand-primary/40" />
        </div>
      </div>

      <div className="space-y-4 mb-10">
        <div 
          onClick={onOpenMeditation}
          className="glass p-8 rounded-[40px] flex items-center justify-between group cursor-pointer hover:bg-white/60 transition-all"
        >
          <div className="flex items-center gap-6">
            <div className="w-14 h-14 bg-brand-primary/10 rounded-full flex items-center justify-center">
              <Waves className="w-6 h-6 text-brand-primary" />
            </div>
            <div>
              <p className="label-xs !opacity-40 mb-1">Guided Practice</p>
              <h3 className="text-2xl italic">Stillness Portal</h3>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 opacity-20 group-hover:translate-x-1 group-hover:opacity-40 transition-all" />
        </div>

        <div className="glass p-8 rounded-[40px] flex items-center justify-between group">
          <div className="flex items-center gap-6">
             <div className="w-14 h-14 bg-[#5A5A40]/10 rounded-full flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-brand-primary" />
            </div>
            <div>
              <p className="label-xs !opacity-40 mb-1">AI Recommendation</p>
              <h3 className="text-lg font-serif italic max-w-[180px] leading-tight">Focus on Spinal Release today</h3>
            </div>
          </div>
        </div>
      </div>

      <button 
        onClick={onStart}
        disabled={generating}
        className="w-full bg-brand-ink text-brand-bg py-6 rounded-full text-xs uppercase tracking-[0.4em] font-semibold transition-all flex items-center justify-center gap-4 group disabled:opacity-70 shadow-xl active:scale-95"
      >
        {generating ? (
          <>
            <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1 }} className="w-4 h-4 border border-white/30 border-t-white rounded-full" />
            Generating Journey
          </>
        ) : (
          <>
            Begin Daily Practice
            <Play className="w-4 h-4 text-white/50 group-hover:scale-125 transition-transform" />
          </>
        )}
      </button>
    </motion.div>
  );
}

function WorkoutView({ routine, onCancel, onComplete }: { routine: YogaRoutine; onCancel: () => void; onComplete: (insights: string[]) => void }) {
  const [poseIndex, setPoseIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState(routine.poses[0]?.duration || 30);
  const [isActive, setIsActive] = useState(false);
  const [finished, setFinished] = useState(false);
  const [showIntro, setShowIntro] = useState(true);
  const [sessionInsights, setSessionInsights] = useState<string[]>([]);
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const audioCtxRef = React.useRef<AudioContext | null>(null);
  const audioSourceRef = React.useRef<AudioBufferSourceNode | null>(null);
  const feedbackAudioSourceRef = React.useRef<AudioBufferSourceNode | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [errorStatus, setErrorStatus] = useState<string | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  // Dynamic Aura State
  const [auraPulse, setAuraPulse] = useState(1);

  useEffect(() => {
    if (!isActive || showIntro || finished) return;
    const interval = setInterval(() => {
      setAuraPulse(p => (p === 1 ? 1.05 : 1));
    }, 3000);
    return () => clearInterval(interval);
  }, [isActive, showIntro, finished]);

  // AI Posture Feedback Loop
  useEffect(() => {
    if (!isActive || showIntro || finished) return;

    const feedbackInterval = setInterval(async () => {
      if (!videoRef.current || isAnalyzing) return;

      setIsAnalyzing(true);
      setErrorStatus(null);
      try {
        const canvas = document.createElement('canvas');
        const video = videoRef.current;
        
        // Resize to 512px max for performance and quota
        const maxDim = 512;
        let width = video.videoWidth;
        let height = video.videoHeight;
        
        if (width > height) {
          if (width > maxDim) {
            height *= maxDim / width;
            width = maxDim;
          }
        } else {
          if (height > maxDim) {
            width *= maxDim / height;
            height = maxDim;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(video, 0, 0, width, height);
        
        const base64Image = canvas.toDataURL('image/jpeg', 0.6).split(',')[1];
        const res = await analyzePosture(base64Image, routine.poses[poseIndex].name);
        
        if (res.audio && isActive) {
          // Track text for Growth Report
          if (res.text !== "PERFECT") {
            setSessionInsights(prev => [...prev, res.text]);
          }

          if (!audioCtxRef.current) {
            audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
          }

          try {
            const binary = atob(res.audio);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
              bytes[i] = binary.charCodeAt(i);
            }
            const pcm16 = new Int16Array(bytes.buffer);
            const float32 = new Float32Array(pcm16.length);
            for (let i = 0; i < pcm16.length; i++) float32[i] = pcm16[i] / 32768;

            const buffer = audioCtxRef.current.createBuffer(1, float32.length, 24000);
            buffer.getChannelData(0).set(float32);

            // Stop previous feedback if still playing
            if (feedbackAudioSourceRef.current) {
              feedbackAudioSourceRef.current.stop();
            }

            const source = audioCtxRef.current.createBufferSource();
            source.buffer = buffer;
            source.connect(audioCtxRef.current.destination);
            feedbackAudioSourceRef.current = source;
            source.start();
          } catch (e) {
            console.error("Failed to process feedback audio:", e);
          }
        }
      } catch (err) {
        console.error("Feedback error:", err);
        setErrorStatus("Alignment Scan Interrupted");
        setTimeout(() => setErrorStatus(null), 3000);
      } finally {
        setIsAnalyzing(false);
      }
    }, 15000); // Increased to 15s to be safe with quota

    return () => clearInterval(feedbackInterval);
  }, [poseIndex, isActive, showIntro, finished, isAnalyzing, routine.poses]);

  // Audio Guidance Effect
  useEffect(() => {
    if (!isActive || showIntro || finished) return;

    const currentPose = routine.poses[poseIndex];
    
    async function playGuidance() {
      try {
        // Stop previous instruction
        if (audioSourceRef.current) {
          audioSourceRef.current.stop();
          audioSourceRef.current = null;
        }

        const base64 = await generatePoseAudio(currentPose.name, currentPose.instruction);
        
        if (!base64) return; // Fallback to silence if quota hit

        if (!audioCtxRef.current) {
          audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        }

        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }

        const pcm16 = new Int16Array(bytes.buffer);
        const float32 = new Float32Array(pcm16.length);
        for (let i = 0; i < pcm16.length; i++) {
          float32[i] = pcm16[i] / 32768;
        }

        const buffer = audioCtxRef.current.createBuffer(1, float32.length, 24000);
        buffer.getChannelData(0).set(float32);

        const source = audioCtxRef.current.createBufferSource();
        source.buffer = buffer;
        source.connect(audioCtxRef.current.destination);
        
        audioSourceRef.current = source;
        source.start();
      } catch (err) {
        console.error("Failed to play pose guidance:", err);
      }
    }

    playGuidance();

    return () => {
      if (audioSourceRef.current) {
        audioSourceRef.current.stop();
        audioSourceRef.current = null;
      }
    };
  }, [poseIndex, isActive, showIntro, finished, routine.poses]);

  useEffect(() => {
    let timer: any;
    if (isActive && timeLeft > 0) {
      timer = setInterval(() => setTimeLeft(t => t - 1), 1000);
    } else if (timeLeft === 0) {
      if (poseIndex < routine.poses.length - 1) {
        setPoseIndex(i => i + 1);
        setTimeLeft(routine.poses[poseIndex + 1].duration);
      } else {
        setIsActive(false);
        setFinished(true);
      }
    }
    return () => clearInterval(timer);
  }, [isActive, timeLeft, poseIndex, routine.poses]);

  useEffect(() => {
    if (!showIntro && !finished) {
      async function setupCamera() {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: true });
          streamRef.current = stream;
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
          }
        } catch (err) {
          console.error("Camera access failed:", err);
        }
      }
      setupCamera();
    }

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(console.error);
      }
    };
  }, [showIntro, finished]);

  const currentPose = routine.poses[poseIndex];

  if (showIntro) {
    return (
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex-1 flex flex-col p-10 pt-16"
      >
        <header className="mb-12 flex justify-between items-baseline">
          <div className="flex flex-col">
            <span className="label-xs mb-2">Today's Practice</span>
            <h2 className="text-5xl italic">{routine.name}</h2>
          </div>
          <button onClick={onCancel} className="label-xs !opacity-40 hover:!opacity-100 transition-opacity">Exit</button>
        </header>

        <p className="text-sm opacity-60 mb-12 leading-relaxed italic pr-8">
          "{routine.description}"
        </p>
        
        <div className="flex-1 overflow-y-auto space-y-6 mb-12 scrollbar-none">
          <p className="label-xs mb-2">The Flow</p>
          {routine.poses.map((p, i) => (
            <div key={i} className="flex items-center gap-6 group">
              <span className="text-4xl font-serif text-brand-border group-hover:text-brand-primary transition-colors italic w-8">
                {String(i + 1).padStart(2, '0')}
              </span>
              <div className="flex-1 border-b border-brand-border/50 pb-4 flex justify-between items-center pr-2">
                <span className="text-lg font-serif italic text-brand-ink/80">{p.name}</span>
                <span className="label-xs !tracking-widest !opacity-30">{p.duration}s</span>
              </div>
            </div>
          ))}
        </div>

        <button 
          onClick={() => { setShowIntro(false); setIsActive(true); }}
          className="w-full bg-brand-primary text-white py-5 rounded-full text-xs uppercase tracking-[0.3em] font-semibold"
        >
          Begin Session
        </button>
      </motion.div>
    );
  }

  if (finished) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-12 text-center bg-brand-bg">
        <motion.div 
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="w-32 h-32 border border-brand-border rounded-full flex items-center justify-center mb-10"
        >
          <div className="w-20 h-20 bg-brand-primary rounded-full flex items-center justify-center">
            <CheckCircle2 className="w-8 h-8 text-white" />
          </div>
        </motion.div>
        <span className="label-xs mb-4">Practice Concluded</span>
        <h2 className="text-5xl italic mb-6">Namaste</h2>
        <p className="text-xs opacity-60 mb-12 italic leading-relaxed max-w-[240px]">
          "Your breath was consistent and your alignment was stable. Today's practice is archived."
        </p>
        <button 
          onClick={() => onComplete(sessionInsights)}
          className="w-full bg-brand-primary text-white py-5 rounded-full text-xs uppercase tracking-[0.3em] font-semibold"
        >
          Complete Session
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-brand-bg h-full">
      <div className="relative flex-1 bg-brand-ink/5 overflow-hidden">
        {/* Dynamic Background Aura */}
        <div className="absolute inset-0 z-0 pointer-events-none">
          <motion.div 
            animate={{ 
              scale: auraPulse,
              opacity: isActive ? [0.1, 0.2, 0.1] : 0.05
            }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[150%] h-[150%] bg-gradient-radial from-brand-primary/20 via-transparent to-transparent rounded-full blur-[120px]"
          />
        </div>

        {/* User Camera Feed */}
        <video 
          autoPlay 
          muted 
          playsInline 
          ref={videoRef}
          className="w-full h-full object-cover mirror opacity-70 relative z-10"
        />
        
        {/* Indicators Overlay */}
        <div className="absolute top-24 right-8 z-50 flex flex-col gap-3 items-end">
          <div className="flex items-center gap-3 bg-white/10 backdrop-blur-3xl px-6 py-4 rounded-full border border-white/20 shadow-xl">
            <motion.div 
                animate={{ scale: [1, 1.2, 1] }} 
                transition={{ repeat: Infinity, duration: 2 }}
                className="w-2 h-2 bg-brand-primary rounded-full" 
            />
            <span className="label-xs !text-white !opacity-80">AI Instructor Guidance</span>
          </div>

          <AnimatePresence>
            {isAnalyzing && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex items-center gap-3 bg-brand-primary/20 backdrop-blur-3xl px-6 py-3 rounded-full border border-brand-primary/30 shadow-xl"
              >
                <motion.div 
                    animate={{ rotate: 360 }} 
                    transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
                    className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full" 
                />
                <span className="text-[10px] uppercase tracking-widest text-white/90 font-bold">Scanning Alignment</span>
              </motion.div>
            )}
            {errorStatus && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex items-center gap-3 bg-red-500/20 backdrop-blur-3xl px-6 py-3 rounded-full border border-red-500/30 shadow-xl"
              >
                <AlertCircle className="w-3 h-3 text-red-500" />
                <span className="text-[10px] uppercase tracking-widest text-white/90 font-bold">{errorStatus}</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="absolute inset-0 bg-gradient-to-t from-brand-bg via-transparent to-transparent opacity-60 pointer-events-none" />
        
        <div className="absolute top-10 left-10 right-10 flex justify-between items-center mix-blend-difference z-40">
          <span className="label-xs text-white underline underline-offset-8 decoration-white/20">
             Flow: {poseIndex + 1} / {routine.poses.length}
          </span>
          <button onClick={onCancel} className="label-xs text-white !opacity-60 hover:!opacity-100">Exit</button>
        </div>

        <div className="absolute bottom-12 left-10 right-10 flex flex-col items-center z-40">
          <motion.div 
            key={currentPose.name}
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="text-center mb-8"
          >
            <h2 className="text-5xl italic mb-3 text-brand-ink drop-shadow-sm">{currentPose.name}</h2>
            <p className="text-[11px] uppercase tracking-widest opacity-60 italic max-w-xs mx-auto">{currentPose.instruction}</p>
          </motion.div>
          
          <div className="flex items-center gap-12 border-t border-brand-border pt-10 w-full justify-center">
             <div className="text-7xl font-serif italic text-brand-primary tabular-nums">
              {timeLeft}
            </div>
            <button 
              onClick={() => setIsActive(!isActive)}
              className="w-12 h-12 border border-brand-border rounded-full flex items-center justify-center hover:bg-brand-primary group transition-all"
            >
              <Play className={cn("w-4 h-4 transition-colors", isActive ? "fill-brand-ink group-hover:fill-white" : "group-hover:fill-white")} />
            </button>
          </div>
        </div>
        
        {/* Tracking Indicator */}
        <div className="absolute left-10 top-1/2 -translate-y-1/2 flex flex-col items-center gap-4 opacity-30 pointer-events-none z-30">
          <div className="w-px h-12 bg-brand-ink" />
          <Camera className="w-4 h-4" />
          <div className="label-xs [writing-mode:vertical-rl] rotate-180">Tracking Live</div>
          <div className="w-px h-12 bg-brand-ink" />
        </div>
      </div>
    </div>
  );
}

function GrowthReportView({ report, onClose }: { report: GrowthReport; onClose: () => void }) {
  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex-1 flex flex-col p-10 bg-aura overflow-y-auto"
    >
      <header className="mb-12 flex justify-between items-center">
        <h2 className="text-5xl italic">Growth Insights</h2>
        <button onClick={onClose} className="p-3 glass rounded-full ring-1 ring-brand-border/10">
           <ArrowLeft className="w-5 h-5 opacity-40" />
        </button>
      </header>

      <div className="space-y-6">
        <div className="glass p-8 rounded-[40px] border-l-4 border-brand-primary">
          <h4 className="label-xs text-brand-primary mb-4 font-bold">Master's Summary</h4>
          <p className="text-xl font-serif italic italic leading-relaxed text-brand-ink/80">
            "{report.summary}"
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="glass p-8 rounded-[40px]">
            <h4 className="label-xs mb-3 opacity-40">Primary Focus</h4>
            <p className="text-2xl font-serif italic text-brand-primary">{report.focusArea}</p>
          </div>
          <div className="glass p-8 rounded-[40px]">
             <h4 className="label-xs mb-3 opacity-40">Next Goal</h4>
            <p className="text-xs font-medium uppercase tracking-widest leading-tight">{report.suggestedFocusForNextTime}</p>
          </div>
        </div>

        <div className="glass p-12 rounded-[40px] text-center flex flex-col items-center justify-center min-h-[300px] border border-brand-primary/10">
          <Sparkles className="w-8 h-8 text-brand-primary/20 mb-8" />
          <p className="text-3xl font-serif italic leading-snug mb-8">
            {report.zenQuote}
          </p>
          <div className="w-12 h-[1px] bg-brand-primary/40" />
        </div>
      </div>

      <button 
        onClick={onClose}
        className="mt-8 w-full bg-brand-ink text-brand-bg py-6 rounded-full text-xs uppercase tracking-[0.4em] font-semibold transition-all shadow-xl active:scale-95"
      >
        Return to Sanctuary
      </button>
    </motion.div>
  );
}

function MeditationView({ onBack }: { onBack: () => void }) {
  const [duration, setDuration] = useState(5);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const audioSourceRef = React.useRef<AudioBufferSourceNode | null>(null);
  const audioCtxRef = React.useRef<AudioContext | null>(null);
  const bgMusicRef = React.useRef<HTMLAudioElement | null>(null);
  const sessionTimerRef = React.useRef<any>(null);

  const startMeditation = async () => {
    setIsGenerating(true);
    try {
      const base64 = await generateMeditationAudio(duration);
      
      // Initialize AudioContext on user interaction
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      }

      // Start background music
      if (bgMusicRef.current) {
        bgMusicRef.current.currentTime = 0;
        bgMusicRef.current.volume = 0;
        bgMusicRef.current.play();
        // Fade in
        let vol = 0;
        const interval = setInterval(() => {
          if (vol < 0.25) { // Increased volume for "audible" request
            vol += 0.01;
            if (bgMusicRef.current) bgMusicRef.current.volume = vol;
          } else {
            clearInterval(interval);
          }
        }, 100);
      }

      if (base64) {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }

        // Gemini TTS returns raw 16-bit PCM at 24000Hz mono
        const pcm16 = new Int16Array(bytes.buffer);
        const float32 = new Float32Array(pcm16.length);
        for (let i = 0; i < pcm16.length; i++) {
          float32[i] = pcm16[i] / 32768;
        }

        const buffer = audioCtxRef.current.createBuffer(1, float32.length, 24000);
        buffer.getChannelData(0).set(float32);

        const source = audioCtxRef.current.createBufferSource();
        source.buffer = buffer;
        source.connect(audioCtxRef.current.destination);
        
        source.onended = () => {
          // Voice ended, but session continues until duration timer ends
          audioSourceRef.current = null;
        };

        audioSourceRef.current = source;
        source.start();
      } else {
        console.warn("Meditation voice synthesis unavailable (Quota Exhausted). Continuing with music only.");
      }
      
      setIsPlaying(true);
      
      // Start session timer
      setSecondsLeft(duration * 60);
    } catch (error) {
      console.error("Failed to generate meditation:", error);
      alert("Failed to generate meditation audio. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  useEffect(() => {
    if (isPlaying && secondsLeft > 0) {
      sessionTimerRef.current = setInterval(() => {
        setSecondsLeft(s => {
          if (s <= 1) {
            stopMeditation();
            return 0;
          }
          return s - 1;
        });
      }, 1000);
    }
    return () => {
      if (sessionTimerRef.current) clearInterval(sessionTimerRef.current);
    };
  }, [isPlaying, secondsLeft]);

  const stopMeditation = () => {
    if (audioSourceRef.current) {
      try {
        audioSourceRef.current.stop();
      } catch (e) {
        // Source might already be stopped
      }
      audioSourceRef.current = null;
    }
    
    if (bgMusicRef.current) {
      // Fade out
      let vol = bgMusicRef.current.volume;
      const interval = setInterval(() => {
        if (vol > 0.01) {
          vol -= 0.01;
          if (bgMusicRef.current) bgMusicRef.current.volume = vol;
        } else {
          if (bgMusicRef.current) {
            bgMusicRef.current.pause();
            bgMusicRef.current.currentTime = 0;
          }
          clearInterval(interval);
        }
      }, 50);
    }
    
    if (sessionTimerRef.current) {
      clearInterval(sessionTimerRef.current);
      sessionTimerRef.current = null;
    }

    setIsPlaying(false);
    setSecondsLeft(0);
  };

  useEffect(() => {
    return () => {
      stopMeditation();
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(console.error);
      }
    };
  }, []);

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.05 }}
      className="flex-1 flex flex-col p-10 pt-16"
    >
      <header className="mb-12 flex justify-between items-baseline">
        <div className="flex flex-col">
          <span className="label-xs mb-2">Meditation Sanctuary</span>
          <h2 className="text-5xl italic">Guided Stillness</h2>
        </div>
        <button onClick={onBack} className="label-xs !opacity-40 hover:!opacity-100 transition-opacity">Exit</button>
      </header>

      {!isPlaying ? (
        <div className="flex-1 flex flex-col justify-center gap-12">
          <div className="space-y-6 text-center">
            <p className="text-sm opacity-60 italic max-w-[200px] mx-auto leading-relaxed">
              Find a quiet space, put on your headphones, and select your journey's length.
            </p>
            <div className="text-7xl font-light italic text-brand-primary flex justify-center items-baseline gap-2">
              {duration}
              <span className="text-lg font-sans text-brand-ink/40 font-normal tracking-widest">MINS</span>
            </div>
            <input 
              type="range"
              min={1}
              max={20}
              value={duration}
              onChange={(e) => setDuration(parseInt(e.target.value))}
              className="w-full accent-brand-primary h-px bg-brand-border appearance-none cursor-pointer"
            />
          </div>

          <button 
            onClick={startMeditation}
            disabled={isGenerating}
            className="w-full bg-brand-primary text-white py-6 rounded-full text-xs uppercase tracking-[0.3em] font-semibold transition-all flex items-center justify-center gap-4 group disabled:opacity-70"
          >
            {isGenerating ? (
              <>
                <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1 }} className="w-4 h-4 border border-white/30 border-t-white rounded-full" />
                Channeling Stillness...
              </>
            ) : (
              <>
                Begin Journey
                <div className="w-1.5 h-1.5 bg-white/40 rounded-full group-hover:scale-125 transition-transform" />
              </>
            )}
          </button>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center gap-12 text-center">
          <div className="relative">
            <motion.div 
              animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.6, 0.3] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              className="w-64 h-64 border border-brand-primary rounded-full absolute -inset-4"
            />
             <motion.div 
              animate={{ scale: [1, 1.1, 1], opacity: [0.5, 0.8, 0.5] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              className="w-64 h-64 border border-brand-primary rounded-full absolute -inset-2"
            />
            <div className="w-64 h-64 bg-brand-primary rounded-full flex flex-col items-center justify-center text-white p-8 shadow-2xl relative z-10">
              <span className="label-xs mb-2 !text-white/60">Currently Listening</span>
              <p className="text-lg font-serif italic mb-4">Deep Presence</p>
              <div className="text-xs font-mono tracking-tighter opacity-70 mb-4">
                {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')}
              </div>
              <motion.div 
                animate={{ height: [4, 12, 4, 8, 4] }}
                transition={{ duration: 1, repeat: Infinity }}
                className="flex gap-1"
              >
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="w-1 bg-white/80 rounded-full" />
                ))}
              </motion.div>
            </div>
          </div>

          <p className="text-xs opacity-60 italic max-w-[240px] leading-relaxed">
            Close your eyes. Focus only on the voice and your breath.
          </p>

          <button 
             onClick={stopMeditation}
             className="text-stone-400 hover:text-brand-ink transition-colors label-xs !tracking-[0.4em] !opacity-100 flex items-center gap-3 border-b border-brand-border/0 hover:border-brand-border pb-1"
          >
            END SESSION
          </button>
          
          <audio 
            ref={bgMusicRef}
            src="https://assets.mixkit.co/music/preview/mixkit-beautiful-dream-493.mp3"
            loop
          />
        </div>
      )}
      
      <footer className="mt-auto pt-10 text-center opacity-20">
        <p className="label-xs">The Sanctuary is Open</p>
      </footer>
    </motion.div>
  );
}

function SettingsView({ user, onBack, onUpdate, onLogout }: { user: UserData; onBack: () => void; onUpdate: (d: Partial<UserData>) => void; onLogout: () => void }) {
  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex-1 flex flex-col p-10 pt-16"
    >
      <header className="flex justify-between items-baseline mb-12">
        <h2 className="text-4xl italic">Settings</h2>
        <button onClick={onBack} className="label-xs !opacity-40 hover:!opacity-100">Back</button>
      </header>

      <div className="space-y-12">
        <section>
          <p className="label-xs mb-6 underline underline-offset-8 decoration-brand-border">Biological Data</p>
          <div className="space-y-6">
            <div className="flex justify-between items-center pb-2 border-b border-brand-border/30">
              <span className="text-xl font-serif italic opacity-60">Age</span>
              <div className="flex items-center gap-2">
                <input 
                  type="number" 
                  value={user.age} 
                  onChange={(e) => onUpdate({ age: parseInt(e.target.value) || 0 })}
                  className="w-12 bg-transparent text-right font-light focus:outline-none"
                />
                <span className="text-[10px] uppercase opacity-30">Yrs</span>
              </div>
            </div>
            <div className="flex justify-between items-center pb-2 border-b border-brand-border/30">
              <span className="text-xl font-serif italic opacity-60">Height</span>
              <div className="flex items-center gap-2">
                <input 
                  type="number" 
                  value={user.height} 
                  onChange={(e) => onUpdate({ height: parseInt(e.target.value) || 0 })}
                  className="w-16 bg-transparent text-right font-light focus:outline-none"
                />
                <span className="text-[10px] uppercase opacity-30">cm</span>
              </div>
            </div>
            <div className="flex justify-between items-center pb-2 border-b border-brand-border/30">
              <span className="text-xl font-serif italic opacity-60">Weight</span>
              <div className="flex items-center gap-2">
                <input 
                  type="number" 
                  value={user.weight} 
                  onChange={(e) => onUpdate({ weight: parseInt(e.target.value) || 0 })}
                  className="w-16 bg-transparent text-right font-light focus:outline-none"
                />
                <span className="text-[10px] uppercase opacity-30">kg</span>
              </div>
            </div>
            <div className="flex justify-between items-baseline pb-2 border-b border-brand-border/30 opacity-40">
              <span className="text-xl font-serif italic">Calculated BMI</span>
              <span className="text-sm font-light">{user.bmi.toFixed(1)}</span>
            </div>
          </div>
        </section>

        <section>
          <p className="label-xs mb-6 underline underline-offset-8 decoration-brand-border">Mindfulness Schedule</p>
          <div className="flex justify-between items-center p-6 bg-stone-100/40 rounded-3xl border border-brand-border">
            <div className="flex flex-col">
              <span className="text-lg font-serif italic mb-1">Practice Reminder</span>
              <span className="text-[10px] opacity-40 uppercase tracking-widest">Daily nudge</span>
            </div>
            <input 
              type="time" 
              value={user.reminderTime} 
              onChange={(e) => onUpdate({ reminderTime: e.target.value })}
              className="bg-transparent text-xl font-serif font-light outline-none border-b border-brand-ink/20"
            />
          </div>
        </section>

        <button 
          onClick={onLogout}
          className="w-full flex items-center justify-center gap-3 py-5 text-stone-400 hover:text-red-800 transition-colors label-xs !tracking-[0.4em] !opacity-100"
        >
          <LogOut className="w-4 h-4 opacity-40" />
          Terminate Session
        </button>
      </div>

      <footer className="mt-auto pt-10 text-center opacity-20">
        <p className="label-xs">Zenith AI MMXXIV</p>
      </footer>
    </motion.div>
  );
}


