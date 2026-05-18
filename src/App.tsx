import React, { useState, useEffect, useRef } from "react";
import { 
  collection, 
  addDoc, 
  onSnapshot, 
  query, 
  orderBy, 
  serverTimestamp, 
  doc, 
  setDoc, 
  updateDoc,
  where,
  getDocs,
  getDoc,
  limit,
  Timestamp,
  getDocFromServer,
  arrayUnion
} from "firebase/firestore";
import { db, COLLECTIONS, OperationType, handleFirestoreError } from "./lib/firebase";
import { formatTime } from "./lib/utils";
import { 
  BellOff,
  Bell,
  Archive,
  Trash2,
  X,
  Send, 
  Search, 
  MoreVertical, 
  Smile, 
  Paperclip, 
  CheckCheck,
  User as UserIcon,
  LogOut,
  MessageSquare,
  ChevronLeft,
  Settings,
  Camera,
  AtSign,
  UserCircle,
  Check,
  Moon,
  Sun,
  Languages,
  Pin,
  Star,
  Forward,
  Reply,
  Edit2,
  Image as ImageIcon,
  Mic,
  Video,
  BarChart3,
  Hash,
  Users,
  Compass,
  Sparkles,
  Zap,
  ShieldCheck,
  Smartphone,
  Plus,
  Trophy,
  Play
} from "lucide-react";

import { io, Socket } from "socket.io-client";

const USER_COLORS = [
  "#ff8c00", // Orange
  "#e91e63", // Pink
  "#9c27b0", // Purple
  "#2196f3", // Blue
  "#00bcd4", // Cyan
  "#4caf50", // Green
  "#ffeb3b", // Yellow
  "#ff5722", // Deep Orange
  "#795548", // Brown
  "#607d8b", // Blue Grey
];

const getUserColor = (id: string) => {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  return USER_COLORS[Math.abs(hash) % USER_COLORS.length];
};

import { motion, AnimatePresence } from "motion/react";
import EmojiPicker from "emoji-picker-react";
import { cn } from "./lib/utils";

// --- Types ---
interface Message {
  id: string;
  senderId: string;
  text: string;
  timestamp: any;
  readBy?: string[];
  replyTo?: string; // ID of the message being replied to
  reactions?: Record<string, string[]>; // emoji -> list of userIds
  isEdited?: boolean;
  deletedBy?: string[];
  type: "text" | "voice" | "video" | "poll" | "image";
  mediaUrl?: string;
}

interface User {
  id: string;
  username: string;
  displayName: string;
  photoURL?: string;
  isOnline: boolean;
  lastSeen: any;
  isTyping?: string | null;
  bio?: string;
  folders?: string[];
}

interface Chat {
  id: string;
  participants: string[];
  lastMessage?: string;
  updatedAt: any;
  mutedBy?: string[];
  archivedBy?: string[];
  deletedBy?: string[];
  pinnedBy?: string[];
  type: "dm" | "group" | "channel";
  title?: string;
  photoURL?: string;
  description?: string;
  ownerId?: string;
  admins?: string[];
}

interface Story {
  id: string;
  userId: string;
  mediaUrl: string;
  timestamp: any;
  viewers?: string[];
}

// --- Main Application Component ---
export default function App() {
  const [currentUserId, setCurrentUserId] = useState<string | null>(localStorage.getItem("chat_uid"));
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const [selectedRecipient, setSelectedRecipient] = useState<User | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(!!currentUserId);
  const [view, setView] = useState<"game" | "profile">("game");
  const [theme, setTheme] = useState<"dark" | "light">((localStorage.getItem("app_theme") as "dark" | "light") || "dark");
  const [lang, setLang] = useState<"en" | "ar">((localStorage.getItem("app_lang") as "en" | "ar") || "en");

  useEffect(() => {
    localStorage.setItem("app_theme", theme);
    localStorage.setItem("app_lang", lang);
  }, [theme, lang]);

  useEffect(() => {
    // Connection test as per guidelines
    const testConnection = async () => {
      try {
        await getDocFromServer(doc(db, COLLECTIONS.USERS, "connection_test"));
      } catch (error) {
        if (error instanceof Error && error.message.includes("offline")) {
          console.error("Firebase is offline. Check configuration or project status.");
        }
      }
    };
    testConnection();

    if (!currentUserId) return;

    const userRef = doc(db, COLLECTIONS.USERS, currentUserId);
    return onSnapshot(userRef, (snapshot) => {
      if (snapshot.exists()) {
        setCurrentUser({ id: snapshot.id, ...snapshot.data() } as User);
        setIsLoggedIn(true);
      } else {
        setIsLoggedIn(false);
        setCurrentUserId(null);
        localStorage.removeItem("chat_uid");
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `${COLLECTIONS.USERS}/${currentUserId}`);
    });
  }, [currentUserId]);

  let content;
  if (!isLoggedIn) {
    content = <Login lang={lang} onLogin={(uid) => {
      localStorage.setItem("chat_uid", uid);
      setCurrentUserId(uid);
      setIsLoggedIn(true);
    }} />;
  } else if (!currentUser) {
    content = (
      <div className="flex h-full w-full items-center justify-center bg-app-bg relative">
        <div className="absolute inset-0 bg-radial-at-t from-app-accent/20 to-transparent opacity-50 blur-3xl pointer-events-none" />
        <div className="flex flex-col items-center gap-6 z-10">
          <div className="w-16 h-16 border-4 border-app-accent/10 border-t-app-accent rounded-full animate-spin" />
          <p className="text-app-text-muted font-bold text-xs tracking-widest animate-pulse uppercase">{lang === 'ar' ? 'جاري المزامنة...' : 'Syncing...'}</p>
        </div>
      </div>
    );
  } else {
    content = (
      <div className="flex h-full w-full overflow-hidden bg-app-bg">
        {/* Sidebar - Hidden on mobile when a chat is selected */}
        <div className={cn(
          "w-full md:w-80 lg:w-[380px] shrink-0 border-r border-white/5",
          (selectedChat || view === "profile") ? "hidden md:block" : "block"
        )}>
          <Sidebar 
            currentUser={currentUser!} 
            lang={lang}
            onSelectChat={(chat, recipient) => {
              setSelectedChat(chat);
              setSelectedRecipient(recipient);
              setView("game");
            }} 
            selectedChatId={selectedChat?.id}
            onOpenProfile={() => setView("profile")}
          />
        </div>

        {/* Main View - GameWindow or Profile or EmptyState */}
        <div className={cn(
          "flex-1 relative bg-app-bg shadow-2xl",
          (!selectedChat && view !== "profile") ? "hidden md:block" : "block"
        )}>
          {view === "profile" ? (
            <ProfileView 
              user={currentUser!} 
              theme={theme}
              setTheme={setTheme}
              lang={lang}
              setLang={setLang}
              onBack={() => setView("game")} 
              onLogout={() => {
                localStorage.removeItem("chat_uid");
                setCurrentUserId(null);
                setIsLoggedIn(false);
              }}
            />
          ) : selectedChat ? (
            <SoccerGame 
              currentUser={currentUser!} 
              roomId={selectedChat.id} 
              lang={lang}
              onBack={() => setSelectedChat(null)}
            />
          ) : (
            <div className="hidden md:flex h-full flex-col items-center justify-center bg-app-bg relative overflow-hidden">
               <div className="absolute inset-0 opacity-[0.02] pointer-events-none" 
                 style={{ 
                   backgroundImage: `url("https://www.transparenttextures.com/patterns/cubes.png")`,
                   backgroundRepeat: 'repeat'
                 }} 
               />
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-app-accent/10 blur-[100px] rounded-full" />
              
              <div className="text-center space-y-8 z-10 px-8">
                 <div className="w-40 h-40 glass-panel rounded-[40px] flex items-center justify-center mx-auto shadow-2xl rotate-6 animate-bounce p-1">
                   <div className="w-full h-full bg-app-accent rounded-[32px] flex items-center justify-center">
                     <Trophy size={64} className="text-[#030406] -rotate-6" strokeWidth={1} />
                   </div>
                 </div>
                 <div className="space-y-3">
                   <h2 className="text-3xl font-black text-white tracking-tight">{lang === 'ar' ? 'مستعد للتحدي؟' : 'Ready for the Match?'}</h2>
                   <p className="text-app-text-muted text-sm px-6 font-medium leading-relaxed max-w-[320px] mx-auto">
                     {lang === 'ar' ? 'اختر منافساً من القائمة الجانبية لبدء مباراة كرة قدم حماسية.' : 'Select an opponent from the sidebar to start a high-stakes football match.'}
                   </p>
                 </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={cn(
      "flex h-screen w-full bg-app-bg text-app-text overflow-hidden relative font-sans",
      theme === "light" && "light",
      lang === "ar" && "rtl"
    )} dir={lang === "ar" ? "rtl" : "ltr"}>
      {/* Background elements */}
      <div className="absolute top-0 left-0 w-full h-[600px] bg-app-accent/5 blur-[120px] rounded-full -translate-y-1/2 pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-full h-[600px] bg-blue-500/5 blur-[120px] rounded-full translate-y-1/2 pointer-events-none" />
      
      <div className="relative w-full h-full flex flex-col z-10">
        <div className="flex-1 flex flex-col relative overflow-hidden">
          {content}
        </div>
      </div>
    </div>
  );
}

// --- Soccer Game Component ---
function SoccerGame({ currentUser, roomId, onBack, lang }: { currentUser: User, roomId: string, onBack: () => void, lang: "en" | "ar" }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const [gameState, setGameState] = useState<any>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    socketRef.current = io(window.location.origin);
    const socket = socketRef.current;

    socket.on("connect", () => {
      socket.emit("join-game", roomId);
      setIsConnected(true);
    });

    socket.on("game-state", (state) => {
      setGameState(state);
    });

    socket.on("player-moved", ({ id, x, y, ball }) => {
      setGameState((prev: any) => {
        if (!prev) return prev;
        return {
          ...prev,
          ball,
          players: {
            ...prev.players,
            [id]: { ...prev.players[id], x, y }
          }
        };
      });
    });

    socket.on("ball-update", (ball) => {
      setGameState((prev: any) => prev ? { ...prev, ball } : prev);
    });

    socket.on("goal", ({ state }) => {
      setGameState(state);
    });

    return () => {
      socket.disconnect();
    };
  }, [roomId]);

  useEffect(() => {
    if (!canvasRef.current || !gameState) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Pitch
      ctx.fillStyle = "#1e3a2f"; // Dark green football field
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Lawn stripes
      ctx.fillStyle = "rgba(0,0,0,0.1)";
      for(let i=0; i<canvas.width; i+=80) {
        if((i/80)%2 === 0) ctx.fillRect(i, 0, 40, canvas.height);
      }

      // Lines
      ctx.strokeStyle = "rgba(255,255,255,0.4)";
      ctx.lineWidth = 3;
      ctx.strokeRect(5, 5, canvas.width - 10, canvas.height - 10);
      
      // Center Line
      ctx.beginPath();
      ctx.moveTo(canvas.width / 2, 0);
      ctx.lineTo(canvas.width / 2, canvas.height);
      ctx.stroke();
      
      // Center Circle
      ctx.beginPath();
      ctx.arc(canvas.width / 2, canvas.height / 2, 70, 0, Math.PI * 2);
      ctx.stroke();
      
      // Center Spot
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      ctx.beginPath();
      ctx.arc(canvas.width / 2, canvas.height / 2, 5, 0, Math.PI * 2);
      ctx.fill();

      // Goals (D-Boxes)
      ctx.strokeRect(0, canvas.height/2 - 120, 80, 240);
      ctx.strokeRect(canvas.width - 80, canvas.height/2 - 120, 80, 240);

      // Goals (Inner)
      ctx.fillStyle = "rgba(255,255,255,0.15)";
      ctx.fillRect(0, canvas.height / 2 - 60, 20, 120);
      ctx.fillRect(canvas.width - 20, canvas.height / 2 - 60, 20, 120);

      // Draw Ball
      const ball = gameState.ball;
      ctx.shadowBlur = 10;
      ctx.shadowColor = "rgba(0,0,0,0.5)";
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      
      // Ball details (classic soccer pattern segments)
      ctx.strokeStyle = "#333";
      ctx.lineWidth = 1;
      for(let i=0; i<5; i++) {
        ctx.beginPath();
        ctx.moveTo(ball.x, ball.y);
        ctx.lineTo(ball.x + Math.cos(i*1.2)*10, ball.y + Math.sin(i*1.2)*10);
        ctx.stroke();
      }

      // Draw Players
      Object.values(gameState.players).forEach((p: any) => {
        const isMe = p.id === socketRef.current?.id;
        
        ctx.shadowBlur = 15;
        ctx.shadowColor = p.side === 'left' ? "rgba(239, 68, 68, 0.4)" : "rgba(59, 130, 246, 0.4)";
        
        ctx.fillStyle = p.side === 'left' ? "#ef4444" : "#3b82f6";
        ctx.beginPath();
        ctx.arc(p.x, p.y, 22, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.shadowBlur = 0;
        ctx.strokeStyle = isMe ? "#fff" : "rgba(255,255,255,0.3)";
        ctx.lineWidth = isMe ? 4 : 2;
        ctx.stroke();
        
        // Player Label
        ctx.fillStyle = "white";
        ctx.font = "bold 12px Inter";
        ctx.textAlign = "center";
        const label = isMe ? (lang === 'ar' ? 'أنت' : 'YOU') : (p.ready ? 'READY' : '...');
        ctx.fillText(label, p.x, p.y - 35);
      });

      animationFrameId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animationFrameId);
  }, [gameState, lang]);

  const handleMouseMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!gameState || !canvasRef.current) return;
    if (gameState.status !== 'playing') return;
    
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    
    let clientX, clientY;
    if ("touches" in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    const x = (clientX - rect.left) * (canvas.width / rect.width);
    const y = (clientY - rect.top) * (canvas.height / rect.height);
    
    socketRef.current?.emit("move-player", { roomId, x, y });
  };

  const handleReady = () => {
    socketRef.current?.emit("player-ready", roomId);
  };

  const scores = gameState ? (Object.values(gameState.players) as any[]).reduce((acc: any, p: any) => {
    acc[p.side] = p.score;
    return acc;
  }, { left: 0, right: 0 }) : { left: 0, right: 0 };

  const me = gameState?.players[socketRef.current?.id || ""];

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0b141a] relative overflow-hidden">
      {/* Header */}
      <div className="z-20 h-16 bg-[#1f2c33] flex items-center justify-between px-4 shrink-0 shadow-md">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2 hover:bg-white/5 rounded-full text-app-text transition-all active:scale-90">
             <ChevronLeft size={24} />
          </button>
          <div className="flex flex-col">
            <span className="font-bold text-white uppercase tracking-widest text-[11px]">{lang === 'ar' ? 'سالي سالو - مباراة' : 'SALLY SALOO - MATCH'}</span>
            <div className="flex items-center gap-4 text-app-accent font-black text-xl">
               <span className="text-red-500">{scores.left}</span>
               <span className="text-white/20 text-sm">VS</span>
               <span className="text-blue-500">{scores.right}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="px-3 py-1 bg-white/5 rounded-lg border border-white/10 text-[10px] font-black text-app-text-muted uppercase tracking-widest">
            {gameState?.status || 'Connecting...'}
          </div>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-4 relative bg-[#111b21]">
        {!isConnected ? (
          <div className="text-center space-y-4">
            <div className="w-12 h-12 border-4 border-app-accent/20 border-t-app-accent rounded-full animate-spin mx-auto" />
            <p className="text-app-text-muted font-bold text-xs animate-pulse tracking-widest uppercase">{lang === 'ar' ? 'جاري الاتصال بالملعب...' : 'Connecting to pitch...'}</p>
          </div>
        ) : (
          <div className="relative w-full max-w-[800px] aspect-[4/3] bg-black rounded-xl overflow-hidden shadow-[0_0_100px_-20px_rgba(16,185,129,0.3)] border-4 border-[#1f2c33]">
            <canvas 
              ref={canvasRef} 
              width={800} 
              height={600} 
              className={cn("w-full h-full touch-none", gameState?.status === 'playing' ? "cursor-none" : "opacity-40")}
              onMouseMove={handleMouseMove}
              onTouchMove={handleMouseMove}
            />
            
            {/* Overlay for Ready State */}
            {gameState?.status !== 'playing' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 backdrop-blur-sm z-30 p-8">
                <div className="text-center space-y-6 max-w-sm">
                   <Trophy size={64} className="text-app-accent mx-auto animate-bounce" />
                   <h3 className="text-3xl font-black text-white italic tracking-tighter uppercase">
                     {gameState?.status === 'waiting' 
                       ? (lang === 'ar' ? 'في انتظار الخصم...' : 'WAITING FOR RIVAL...')
                       : (lang === 'ar' ? 'استعد!' : 'GET READY!')}
                   </h3>
                   <p className="text-white/60 text-sm font-medium">
                     {gameState?.status === 'waiting' 
                       ? (lang === 'ar' ? 'سيتم تفعيل اللعب فور دخول الخصم.' : 'Match will initiate once opponent logic synchronizes.')
                       : (lang === 'ar' ? 'كلا اللاعبين موجودين. اضغط استعد للبدء.' : 'Both rivals detected. Signal ready to kick off.')}
                   </p>
                   
                   {me && !me.ready && gameState?.status !== 'waiting' && (
                     <button 
                       onClick={handleReady}
                       className="w-full bg-app-accent hover:glow-accent text-[#030406] font-black py-4 rounded-xl transition-all active:scale-95 shadow-xl uppercase tracking-widest flex items-center justify-center gap-2"
                     >
                       <Play size={20} fill="currentColor" />
                       {lang === 'ar' ? 'استعداد!' : 'SIGNAL READY!'}
                     </button>
                   )}
                   
                   {me?.ready && (
                     <div className="w-full py-4 rounded-xl border-2 border-app-accent text-app-accent font-black uppercase tracking-widest animate-pulse">
                       {lang === 'ar' ? 'تم الاستعداد' : 'READY SIGNALED'}
                     </div>
                   )}

                   <div className="flex justify-center gap-8 mt-12 w-full pt-8 border-t border-white/10">
                      {Object.values(gameState?.players || {}).map((p: any) => (
                        <div key={p.id} className="flex flex-col items-center gap-2">
                          <div className={cn("w-3 h-3 rounded-full", p.ready ? "bg-emerald-500 glow-emerald" : "bg-red-500")} />
                          <span className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em]">
                            {p.side === 'left' ? 'TEAM RED' : 'TEAM BLUE'}
                          </span>
                        </div>
                      ))}
                   </div>
                </div>
              </div>
            )}

            {/* Visual Cues */}
            <div className="absolute top-4 left-4 bg-red-500/20 text-red-500 text-[10px] px-2 py-1 rounded font-black border border-red-500/30 uppercase tracking-widest z-20">Team Red</div>
            <div className="absolute top-4 right-4 bg-blue-500/20 text-blue-500 text-[10px] px-2 py-1 rounded font-black border border-blue-500/30 uppercase tracking-widest z-20">Team Blue</div>
          </div>
        )}
      </div>

      {/* Control Hint */}
      <div className="p-6 text-center text-app-text-muted/40 text-[10px] font-black uppercase tracking-[0.3em]">
        {lang === 'ar' ? 'حرك الفأرة أو إصبعك للتحكم في دائرتك' : 'Move your cursor or finger to control your circle'}
      </div>
    </div>
  );
}

// ... (Rest of existing Login, Sidebar, ChatItem, etc. components preserved)

// --- Login / Register Component ---
function Login({ onLogin, lang }: { onLogin: (uid: string) => void, lang: "en" | "ar" }) {
  const [isRegistering, setIsRegistering] = useState(false);
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const t = {
    en: {
      create: "Create your account",
      authorize: "Authorize your session",
      fullname: "Full Name",
      username: "Username",
      auth: "Authenticate",
      complete: "Complete Registration",
      init: "Initializing...",
      back: "Back to Login",
      new: "Initialize new account",
      err_user: "User not found",
      err_uname: "Username must be 3-15 characters",
      err_taken: "Username is already taken"
    },
    ar: {
      create: "إنشاء حساب جديد",
      authorize: "تسجيل الدخول",
      fullname: "الاسم الكامل",
      username: "اسم المستخدم",
      auth: "تسجيل الدخول",
      complete: "إكمال التسجيل",
      init: "جاري التحميل...",
      back: "العودة لتسجيل الدخول",
      new: "إنشاء حساب جديد",
      err_user: "المستخدم غير موجود",
      err_uname: "يجب أن يكون اسم المستخدم بين 3-15 حرفاً",
      err_taken: "اسم المستخدم مأخوذ بالفعل"
    }
  }[lang];

  const validateUsername = (uname: string) => {
    return /^[a-zA-Z0-9_]{3,15}$/.test(uname);
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const cleanUsername = username.trim().toLowerCase().replace(/^@/, "");

    try {
      if (isRegistering) {
        if (!validateUsername(cleanUsername)) {
          setError("Username must be 3-15 characters");
          setLoading(false);
          return;
        }

        const usernameRef = doc(db, COLLECTIONS.USERNAMES, cleanUsername);
        const nameSnap = await getDoc(usernameRef);
        
        if (nameSnap.exists()) {
          setError(t.err_taken);
          setLoading(false);
          return;
        }

        const uid = crypto.randomUUID();
        const userRef = doc(db, COLLECTIONS.USERS, uid);
        await setDoc(userRef, {
          username: cleanUsername,
          displayName: displayName.trim() || cleanUsername,
          isOnline: true,
          lastSeen: serverTimestamp(),
          photoURL: `https://api.dicebear.com/7.x/avataaars/svg?seed=${cleanUsername}&backgroundColor=0ea5e9,1e293b`
        });

        await setDoc(usernameRef, { uid });
        onLogin(uid);
      } else {
        const usernameRef = doc(db, COLLECTIONS.USERNAMES, cleanUsername);
        const nameSnap = await getDoc(usernameRef);
        
        if (!nameSnap.exists()) {
          setError(t.err_user);
          setLoading(false);
          return;
        }
        
        const uid = nameSnap.data().uid;
        onLogin(uid);
      }
    } catch (err) {
      setError("Authentication failure");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-full bg-app-bg px-8 relative overflow-hidden">
      {/* Cinematic Login background */}
      <div className="absolute top-0 left-0 w-full h-full">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] bg-app-accent/10 blur-[80px] rounded-full" />
      </div>

      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full space-y-10 z-10"
      >
        <div className="flex justify-center flex-col items-center gap-6">
          <motion.div 
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="w-24 h-24 bg-gradient-to-tr from-app-accent to-blue-400 rounded-3xl flex items-center justify-center shadow-[0_20px_50px_-10px_rgba(14,165,233,0.5)] rotate-3"
          >
            <MessageSquare size={44} className="text-[#030406] -rotate-3" strokeWidth={2.5} />
          </motion.div>
          <div className="text-center space-y-1">
            <h1 className="text-4xl font-extrabold tracking-tight text-white italic">Sally Saloo</h1>
            <p className="text-app-text-muted font-medium text-sm">
              {isRegistering ? t.create : t.authorize}
            </p>
          </div>
        </div>
        
        <form onSubmit={handleAuth} className="space-y-4">
          <AnimatePresence mode="wait">
            {isRegistering && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
              >
                <input 
                  type="text" 
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder={t.fullname}
                  className="w-full bg-app-surface/50 border border-white/5 rounded-2xl p-4.5 focus:ring-2 focus:ring-app-accent/50 outline-none text-white text-sm transition-all focus:bg-app-surface ring-inset"
                />
              </motion.div>
            )}
          </AnimatePresence>

          <div className="relative group">
            <div className={cn("absolute top-1/2 -translate-y-1/2 text-app-text-muted group-focus-within:text-app-accent transition-colors", lang === "ar" ? "right-4" : "left-4")}>
              <AtSign size={18} />
            </div>
            <input 
              type="text" 
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={t.username}
              className={cn("w-full bg-app-surface/50 border border-white/5 rounded-2xl p-4.5 focus:ring-2 focus:ring-app-accent/50 outline-none text-white text-sm transition-all focus:bg-app-surface ring-inset", lang === "ar" ? "pr-12 pl-4" : "pl-12 pr-4")}
            />
          </div>

          {error && (
            <motion.p 
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="text-red-400 text-xs font-semibold px-2"
            >
              {error}
            </motion.p>
          )}

          <button 
            type="submit"
            disabled={loading}
            className="w-full bg-app-accent hover:glow-accent text-[#030406] font-bold py-4.5 rounded-2xl transition-all disabled:opacity-50 active:scale-[0.98] shadow-lg shadow-app-accent/20"
          >
            {loading ? t.init : isRegistering ? t.complete : t.auth}
          </button>
        </form>

        <div className="text-center">
          <button 
            onClick={() => setIsRegistering(!isRegistering)}
            className="text-white/60 text-sm font-medium hover:text-white transition-colors"
          >
            {isRegistering ? t.back : t.new}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// --- Sidebar: Search and Chat List ---
function Sidebar({ 
  currentUser, 
  onSelectChat, 
  selectedChatId,
  onOpenProfile,
  lang
}: { 
  currentUser: User; 
  onSelectChat: (chat: Chat, recipient: User) => void;
  selectedChatId?: string;
  onOpenProfile: () => void;
  lang: "en" | "ar";
}) {
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [chats, setMatchRooms] = useState<(Chat & { recipient?: User })[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [activeFolder, setActiveFolder] = useState<string>("all");
  const [stories, setStories] = useState<Story[]>([]);

  const t = {
    en: {
      name: "Sally Saloo",
      searchPlaceholder: "Search for opponents...",
      results: "Search Results",
      scanning: "MATCHMAKING...",
      noResults: "No opponents found",
      recent: "Recent Matches",
      empty: "Connect via @username to start a match",
      folders: {
        all: "All",
        personal: "1v1",
        groups: "Tournaments",
        channels: "Leagues"
      }
    },
    ar: {
      name: "سالي سالو",
      searchPlaceholder: "ابحث عن منافسين...",
      results: "نتائج البحث",
      scanning: "جاري البحث عن خصم...",
      noResults: "لم يتم العثور على منافسين",
      recent: "المباريات الأخيرة",
      empty: "تواصل عبر اسم المستخدم لبدء مباراة",
      folders: {
        all: "الكل",
        personal: "1 ضد 1",
        groups: "بطولات",
        channels: "دوريات"
      }
    }
  }[lang];

  // Load Stories
  useEffect(() => {
    const q = query(
      collection(db, COLLECTIONS.STORIES),
      orderBy("timestamp", "desc"),
      limit(10)
    );
    return onSnapshot(q, (snapshot) => {
      setStories(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Story)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, COLLECTIONS.STORIES);
    });
  }, []);

  // Load Chats
  useEffect(() => {
    const q = query(
      collection(db, COLLECTIONS.CHATS),
      where("participants", "array-contains", currentUser.id),
      orderBy("updatedAt", "desc")
    );

    return onSnapshot(q, async (snapshot) => {
      try {
        const chatsData = await Promise.all(snapshot.docs.map(async (chatDoc) => {
          const data = chatDoc.data() as Chat;
          if (data.type === "dm") {
            const recipientId = data.participants.find(p => p !== currentUser.id);
            if (recipientId) {
              const recipientRef = doc(db, COLLECTIONS.USERS, recipientId);
              const recipientSnap = await getDoc(recipientRef);
              const recipientData = recipientSnap.data();
              return { 
                id: chatDoc.id, 
                ...data, 
                recipient: { id: recipientSnap.id, ...(recipientData || {}) } as User 
              };
            }
          }
          return { id: chatDoc.id, ...data };
        }));
        setMatchRooms(chatsData.filter(chat => !chat.deletedBy?.includes(currentUser.id)));
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, COLLECTIONS.CHATS);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, COLLECTIONS.CHATS);
    });
  }, [currentUser.id]);

  // Filter match rooms by folder
  const filteredMatches = chats.filter(chat => {
    if (activeFolder === "all") return true;
    if (activeFolder === "personal") return chat.type === "dm";
    if (activeFolder === "groups") return chat.type === "group";
    if (activeFolder === "channels") return chat.type === "channel";
    return true;
  });

  // Search Logic ... (existing search logic remains)
  useEffect(() => {
    if (search.length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    const performSearch = async () => {
      setIsSearching(true);
      const cleanSearch = search.toLowerCase().replace(/^@/, "");
      const q = query(
        collection(db, COLLECTIONS.USERS),
        where("username", ">=", cleanSearch),
        where("username", "<=", cleanSearch + "\uf8ff"),
        limit(5)
      );
      
      const snap = await getDocs(q);
      setSearchResults(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as User)).filter(u => u.id !== currentUser.id));
      setIsSearching(false);
    };

    const timeoutId = setTimeout(performSearch, 300);
    return () => clearTimeout(timeoutId);
  }, [search, currentUser.id]);

  const handleStartChat = async (recipient: User) => {
    // Check if chat exists
    const q = query(
      collection(db, COLLECTIONS.CHATS),
      where("participants", "array-contains", currentUser.id),
      where("type", "==", "dm")
    );
    const snap = await getDocs(q);
    const existingChat = snap.docs.find(doc => {
      const participants = doc.data().participants as string[];
      return participants.includes(recipient.id);
    });

    if (existingChat) {
      onSelectChat({ id: existingChat.id, ...existingChat.data() } as Chat, recipient);
    } else {
      const newChatRef = await addDoc(collection(db, COLLECTIONS.CHATS), {
        participants: [currentUser.id, recipient.id],
        updatedAt: serverTimestamp(),
        type: "dm"
      });
      onSelectChat({ id: newChatRef.id, participants: [currentUser.id, recipient.id], updatedAt: new Date(), type: "dm" } as Chat, recipient);
    }
    setSearch("");
  };

  return (
    <div className="w-full h-full bg-app-bg flex flex-col overflow-hidden">
      {/* Header */}
      <div className="bg-app-bg shrink-0 pt-6 px-6 pb-2 space-y-4">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-black text-white tracking-tight">{t.name}</h1>
          <div className="flex items-center gap-2">
            <button className="w-10 h-10 flex items-center justify-center rounded-xl bg-app-surface/40 hover:bg-app-surface hover:text-app-accent transition-all"><Zap size={18} /></button>
            <button className="w-10 h-10 flex items-center justify-center rounded-xl bg-app-surface/40 hover:bg-app-surface hover:text-app-accent transition-all" onClick={onOpenProfile}><Settings size={18} /></button>
          </div>
        </div>

        <div className="relative group">
          <Search size={16} className={cn("absolute top-1/2 -translate-y-1/2 text-app-text-muted group-focus-within:text-app-accent transition-colors", lang === "ar" ? "right-4" : "left-4")} />
          <input 
            type="text" 
            placeholder={t.searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={cn("w-full bg-app-surface/50 rounded-2xl py-3 pr-4 text-sm outline-none text-app-text placeholder:text-app-text-muted/50 border border-white/5 focus:border-app-accent/30 focus:ring-1 focus:ring-app-accent/20 transition-all", lang === "ar" ? "pr-11 pl-4" : "pl-11 pr-4")}
          />
        </div>
      </div>

      {/* Folders Bar */}
      <div className="px-5 py-2 flex gap-4 overflow-x-auto no-scrollbar shrink-0 border-b border-white/5">
        {(["all", "personal", "groups", "channels"] as const).map(folder => (
          <button
            key={folder}
            onClick={() => setActiveFolder(folder)}
            className={cn(
              "text-[12px] font-black uppercase tracking-widest pb-2 border-b-2 transition-all whitespace-nowrap",
              activeFolder === folder ? "text-app-accent border-app-accent" : "text-app-text-muted border-transparent opacity-60"
            )}
          >
            {t.folders[folder]}
          </button>
        ))}
      </div>

      {/* Stories Rack */}
      {activeFolder === "all" && search.length < 2 && (
        <div className="px-6 py-4 flex gap-4 overflow-x-auto no-scrollbar shrink-0">
          <button className="flex flex-col items-center gap-2 shrink-0">
            <div className="w-14 h-14 rounded-full border-2 border-dashed border-app-text-muted/30 flex items-center justify-center text-app-text-muted/60 hover:border-app-accent hover:text-app-accent transition-all">
              <Plus size={20} />
            </div>
            <span className="text-[10px] font-bold text-app-text-muted">My Story</span>
          </button>
          {stories.map(story => (
            <StoryCircle key={story.id} story={story} />
          ))}
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-2 space-y-1 pb-6 custom-scrollbar">
        {search.length >= 2 ? (
          <div className="space-y-2">
             <div className="px-4 py-2 text-[10px] font-black text-app-accent uppercase tracking-[0.3em] opacity-80">{t.results}</div>
             {isSearching ? (
               <div className="p-8 text-center text-[10px] text-app-text-muted font-black tracking-widest animate-pulse">{t.scanning}</div>
             ) : (
               searchResults.map(user => (
                <UserItem key={user.id} user={user} onClick={() => handleStartChat(user)} />
               ))
             )}
             {searchResults.length === 0 && !isSearching && (
               <div className="p-8 text-center text-[10px] text-app-text-muted font-bold tracking-widest uppercase italic opacity-40">{t.noResults}</div>
             )}
          </div>
        ) : (
          <>
            {filteredMatches.map((chat) => (
              <ChatItem 
                key={chat.id} 
                chat={chat} 
                isActive={selectedChatId === chat.id}
                onClick={() => onSelectChat(chat, chat.recipient)} 
                currentUserId={currentUser.id}
                lang={lang}
              />
            ))}
            {filteredMatches.length === 0 && (
              <div className="p-12 text-center text-app-text-muted/20 flex flex-col items-center gap-6">
                <div className="w-16 h-16 bg-white/2 rounded-[2rem] flex items-center justify-center border border-white/5">
                  <Trophy size={32} />
                </div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] leading-relaxed">{t.empty}</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Removed Floating Action Button for match focus */}
    </div>
  );
}

function StoryCircle({ story }: { story: Story, key?: any }) {
  const [userData, setUserData] = useState<User | null>(null);

  useEffect(() => {
    getDoc(doc(db, COLLECTIONS.USERS, story.userId)).then(snap => {
      if (snap.exists()) setUserData(snap.data() as User);
    });
  }, [story.userId]);

  if (!userData) return null;

  return (
    <div className="flex flex-col items-center gap-2 shrink-0 cursor-pointer group">
      <div className="w-14 h-14 rounded-full p-0.5 border-2 border-app-accent overflow-hidden transition-transform group-hover:scale-105">
        <img src={userData.photoURL} alt="" className="w-full h-full object-cover rounded-full" />
      </div>
      <span className="text-[10px] font-bold text-app-text truncate w-14 text-center">{userData.displayName.split(' ')[0]}</span>
    </div>
  );
}

function UserItem({ user, onClick }: { user: User, onClick: () => void | Promise<void>, key?: string }) {
  return (
    <div
      onClick={onClick}
      className="px-4 py-3 cursor-pointer flex items-center gap-4 hover:bg-app-surface transition-colors"
    >
      <div className="w-12 h-12 rounded-full overflow-hidden bg-app-surface shrink-0">
        {user.photoURL ? <img src={user.photoURL} className="w-full h-full object-cover" referrerPolicy="no-referrer" /> : <div className="w-full h-full flex items-center justify-center bg-gray-600 text-white font-bold">{user.displayName[0]}</div>}
      </div>
      <div className="flex flex-col min-w-0 border-b border-app-border flex-1 pb-3">
        <span className="font-medium" style={{ color: getUserColor(user.id) }}>{user.displayName}</span>
        <span className="text-app-text-muted text-sm truncate">@{user.username}</span>
      </div>
    </div>
  );
}

function ChatItem({ chat, isActive, onClick, currentUserId, lang }: { chat: Chat & { recipient?: User }, isActive: boolean, onClick: () => void | Promise<void>, currentUserId: string, lang: "en" | "ar", key?: string }) {
  const isMuted = chat.mutedBy?.includes(currentUserId);
  const [unreadCount, setUnreadCount] = useState(0);

  const t = {
    en: { typing: "preparing for match...", open: "Challenge " },
    ar: { typing: "يستعد للمباراة...", open: "تحدَّ " }
  }[lang];

  useEffect(() => {
    const messagesRef = collection(db, COLLECTIONS.CHATS, chat.id, COLLECTIONS.MESSAGES);
    const q = query(messagesRef, where("senderId", "!=", currentUserId));

    return onSnapshot(q, (snapshot) => {
      const unread = snapshot.docs.filter(doc => {
        const data = doc.data();
        return !data.readBy || !data.readBy.includes(currentUserId);
      });
      setUnreadCount(unread.length);
    });
  }, [chat.id, currentUserId]);

  const displayTitle = chat.type === "dm" ? chat.recipient?.displayName : (chat.title || "Group Chat");
  const displayPhoto = chat.type === "dm" ? chat.recipient?.photoURL : chat.photoURL;
  const displayUsername = chat.type === "dm" ? chat.recipient?.username : "group";
  const isTyping = chat.type === "dm" && chat.recipient?.isTyping === chat.id;

  return (
    <motion.div
      whileHover={{ x: 4 }}
      onClick={onClick}
      className={cn(
        "px-4 py-3 cursor-pointer flex items-center gap-4 transition-all rounded-2xl mx-2",
        isActive ? "bg-app-surface border border-white/5 shadow-lg" : "hover:bg-app-surface/30"
      )}
    >
      <div className="relative shrink-0">
        <div className="w-12 h-12 rounded-2xl overflow-hidden bg-app-surface border border-white/10 p-0.5">
          {displayPhoto ? (
            <img src={displayPhoto} className="w-full h-full object-cover rounded-[14px]" referrerPolicy="no-referrer" />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-app-surface text-app-accent font-bold rounded-[14px]">
              {chat.type === "dm" ? displayTitle?.[0] : (chat.type === "group" ? <Users size={20} /> : <Hash size={20} />)}
            </div>
          )}
        </div>
        {chat.type === "dm" && chat.recipient?.isOnline && (
          <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-emerald-500 rounded-full border-2 border-app-bg glow-emerald" />
        )}
      </div>
      <div className="flex-1 min-w-0 flex flex-col justify-center">
        <div className="flex justify-between items-center mb-0.5">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="font-bold text-sm truncate text-white">{displayTitle}</span>
            {isMuted && <BellOff size={11} className="text-app-text-muted/60" />}
            {chat.type === "channel" && <div className="bg-app-accent/20 text-app-accent px-1 rounded text-[8px] font-bold uppercase tracking-widest mt-0.5">CH</div>}
          </div>
          <span className={cn(
            "text-[10px] font-mono",
            unreadCount > 0 ? "text-app-accent font-bold" : "text-app-text-muted/60"
          )}>
            {formatTime(chat.updatedAt)}
          </span>
        </div>
        <div className="flex justify-between items-center gap-2">
          <p className={cn(
            "text-[13px] truncate flex-1",
            unreadCount > 0 ? "text-white font-semibold" : "text-app-text-muted"
          )}>
            {isTyping ? <span className="text-app-accent animate-pulse font-medium">{t.typing}</span> : (chat.lastMessage || `${t.open}${displayUsername}`)}
          </p>
          {unreadCount > 0 && (
            <div className="bg-app-accent text-[#030406] text-[10px] font-black min-w-[18px] h-4.5 rounded-full flex items-center justify-center px-1.5 shrink-0 glow-accent">
              {unreadCount}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// --- Chat Window: Real-time Messages ---
function ChatWindow({ currentUser, chat, recipient, onBack, lang }: { currentUser: User; chat: Chat | null; recipient: User | null; onBack: () => void, lang: "en" | "ar" }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [smartReplies, setSmartReplies] = useState<string[]>([]);
  const [isGeneratingReplies, setIsGeneratingReplies] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const notificationSound = useRef<HTMLAudioElement | null>(null);
  const isFirstLoad = useRef(true);

  const t = {
    en: {
      active: "active node",
      disconnected: "disconnected",
      placeholder: "Secure transmission...",
      access: "Access Granted",
      select: "Select a neural link from the sidebar or search the network to initiate a secure transmission.",
      replyingTo: "Replying to",
      editing: "Editing message",
      summarizing: "Summarizing conversation...",
      summarize: "AI Summary",
      edit: "Edit",
      delete: "Delete",
      reply: "Reply",
      react: "React",
      deletedMsg: "This message was deleted"
    },
    ar: {
      active: "نشط الآن",
      disconnected: "غير متصل",
      placeholder: "رسالة آمنة...",
      access: "تم منح الدخول",
      select: "اختر جهة اتصال من القائمة الجانبية أو ابحث في الشبكة لبدء إرسال آمن.",
      replyingTo: "الرد على",
      editing: "تعديل الرسالة",
      summarizing: "جاري التلخيص...",
      summarize: "ملخص ذكي",
      edit: "تعديل",
      delete: "حذف",
      reply: "رد",
      react: "تفاعل",
      deletedMsg: "تم حذف هذه الرسالة"
    }
  }[lang];

  // ... previous effects for sound and messages ...
  useEffect(() => {
    notificationSound.current = new Audio("https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3");
  }, []);

  useEffect(() => {
    isFirstLoad.current = true;
  }, [chat?.id]);

  useEffect(() => {
    if (!chat) return;

    const messagesRef = collection(db, COLLECTIONS.CHATS, chat.id, COLLECTIONS.MESSAGES);
    const q = query(messagesRef, orderBy("timestamp", "asc"));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Message));
      const lastMsg = msgs[msgs.length - 1];
      const isMuted = chat.mutedBy?.includes(currentUser.id);

      if (!isFirstLoad.current && msgs.length > messages.length && lastMsg?.senderId !== currentUser.id && !isMuted) {
        notificationSound.current?.play().catch(() => {});
        // Trigger smart replies when a new message from recipient arrives
        if (lastMsg && lastMsg.text) {
          generateSmartReplies(lastMsg.text);
        }
      }

      msgs.forEach(msg => {
        if (msg.senderId !== currentUser.id && (!msg.readBy || !msg.readBy.includes(currentUser.id))) {
          const msgRef = doc(db, COLLECTIONS.CHATS, chat.id, COLLECTIONS.MESSAGES, msg.id);
          updateDoc(msgRef, { readBy: arrayUnion(currentUser.id) }).catch(err => console.error(err));
        }
      });

      setMessages(msgs);
      isFirstLoad.current = false;
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `chats/${chat.id}/messages`);
    });

    return unsubscribe;
  }, [chat?.id, currentUser.id]);

  useEffect(() => {
    if (messages.length > 0) {
      const behavior = isFirstLoad.current ? "auto" : "smooth";
      scrollRef.current?.scrollIntoView({ behavior });
    }
  }, [messages.length]);

  const generateSmartReplies = async (incomingText: string) => {
    if (isGeneratingReplies) return;
    setIsGeneratingReplies(true);
    try {
      const response = await fetch("/api/ai/smart-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: incomingText, lang })
      });
      const data = await response.json();
      setSmartReplies(data.replies || []);
    } catch (err) {
      console.error("AI Error:", err);
    } finally {
      setIsGeneratingReplies(false);
    }
  };

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!newMessage.trim() || !chat) return;

    try {
      const messagesRef = collection(db, COLLECTIONS.CHATS, chat.id, COLLECTIONS.MESSAGES);
      
      if (editingMessage) {
        await updateDoc(doc(db, COLLECTIONS.CHATS, chat.id, COLLECTIONS.MESSAGES, editingMessage.id), {
          text: newMessage,
          isEdited: true
        });
        setEditingMessage(null);
      } else {
        await addDoc(messagesRef, {
          senderId: currentUser.id,
          text: newMessage,
          timestamp: serverTimestamp(),
          replyTo: replyTo?.id || null,
          type: "text",
          readBy: [currentUser.id]
        });
      }

      const chatRef = doc(db, COLLECTIONS.CHATS, chat.id);
      updateDoc(chatRef, {
        lastMessage: newMessage,
        updatedAt: serverTimestamp(),
        archivedBy: (chat.archivedBy || []).filter(id => id !== currentUser.id),
        deletedBy: (chat.deletedBy || []).filter(id => id !== currentUser.id)
      });

      setNewMessage("");
      setReplyTo(null);
      setSmartReplies([]);
      setShowEmoji(false);
      updateDoc(doc(db, COLLECTIONS.USERS, currentUser.id), { isTyping: null });
      
      // Force scroll to bottom after send
      setTimeout(() => {
        scrollRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, "messages");
    }
  };

  const handleReaction = async (messageId: string, emoji: string) => {
    if (!chat) return;
    const msgRef = doc(db, COLLECTIONS.CHATS, chat.id, COLLECTIONS.MESSAGES, messageId);
    const msg = messages.find(m => m.id === messageId);
    const reactions = msg?.reactions || {};
    const users = reactions[emoji] || [];
    
    const newUsers = users.includes(currentUser.id) 
      ? users.filter(id => id !== currentUser.id)
      : [...users, currentUser.id];
    
    await updateDoc(msgRef, {
      [`reactions.${emoji}`]: newUsers
    });
  };

  const handleDeleteMessage = async (messageId: string) => {
    if (!chat) return;
    const msgRef = doc(db, COLLECTIONS.CHATS, chat.id, COLLECTIONS.MESSAGES, messageId);
    await updateDoc(msgRef, {
      deletedBy: arrayUnion(currentUser.id)
    });
  };

  const handleTyping = (text: string) => {
    setNewMessage(text);
    if (!chat) return;
    updateDoc(doc(db, COLLECTIONS.USERS, currentUser.id), { isTyping: text.length > 0 ? chat.id : null });
  };

  const handleSummarize = async () => {
    if (!messages.length) return;
    const summaryMsg = lang === "en" ? "Summarizing conversation..." : "جاري تلخيص المحادثة...";
    setNewMessage(summaryMsg);
    try {
      const activeMessages = messages.filter(m => !m.deletedBy?.includes(currentUser.id));
      const response = await fetch("/api/ai/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: activeMessages.slice(-20), lang })
      });
      if (!response.ok) throw new Error("Server unavailable");
      const data = await response.json();
      setNewMessage(data.summary || "");
    } catch (err) {
      console.error("AI Error:", err);
      setNewMessage(lang === "en" ? "AI Summarization unavailable on static hosting. Use Cloud Run." : "تلخيص الذكاء الاصطناعي غير متوفر على الاستضافة الثابتة. استخدم Cloud Run.");
    }
  };

  const toggleMute = async () => {
    if (!chat) return;
    const isMuted = chat.mutedBy?.includes(currentUser.id);
    const newMutedBy = isMuted 
      ? chat.mutedBy!.filter(id => id !== currentUser.id)
      : [...(chat.mutedBy || []), currentUser.id];
    await updateDoc(doc(db, COLLECTIONS.CHATS, chat.id), { mutedBy: newMutedBy });
  };

  const toggleArchive = async () => {
    if (!chat) return;
    const isArchived = chat.archivedBy?.includes(currentUser.id);
    const newArchivedBy = isArchived 
      ? chat.archivedBy!.filter(id => id !== currentUser.id)
      : [...(chat.archivedBy || []), currentUser.id];
    await updateDoc(doc(db, COLLECTIONS.CHATS, chat.id), { archivedBy: newArchivedBy });
    setShowSettings(false);
  };

  const handleDelete = async () => {
    if (!chat) return;
    const newDeletedBy = [...(chat.deletedBy || []), currentUser.id];
    await updateDoc(doc(db, COLLECTIONS.CHATS, chat.id), { deletedBy: newDeletedBy });
    setShowSettings(false);
    onBack();
  };

  if (!chat) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-app-bg relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)", backgroundSize: "40px 40px" }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-app-accent/10 blur-[100px] rounded-full" />
        
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center space-y-8 z-10 px-8"
        >
           <div className="w-32 h-32 glass-panel rounded-[40px] flex items-center justify-center mx-auto shadow-2xl rotate-6 animate-pulse p-1">
             <div className="w-full h-full bg-app-bg rounded-[32px] flex items-center justify-center">
               <MessageSquare size={48} className="text-app-accent opacity-40 -rotate-6" strokeWidth={1} />
             </div>
           </div>
           <div className="space-y-3">
             <h2 className="text-2xl font-black text-white tracking-tight">{t.access}</h2>
             <p className="text-app-text-muted text-sm px-6 font-medium leading-relaxed max-w-[280px] mx-auto">{t.select}</p>
           </div>
           <div className="flex justify-center gap-2">
             <div className="w-1.5 h-1.5 bg-app-accent rounded-full animate-bounce [animation-delay:-0.3s]" />
             <div className="w-1.5 h-1.5 bg-app-accent rounded-full animate-bounce [animation-delay:-0.15s]" />
             <div className="w-1.5 h-1.5 bg-app-accent rounded-full animate-bounce" />
           </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0b141a] relative overflow-hidden">
      {/* WhatsApp Background Pattern */}
      <div className="absolute inset-0 opacity-[0.06] pointer-events-none z-0" 
        style={{ 
          backgroundImage: `url("https://www.transparenttextures.com/patterns/shattered.png")`,
          backgroundRepeat: 'repeat'
        }} 
      />
      
      {/* Header */}
      <div className="z-20 h-16 bg-[#1f2c33] flex items-center justify-between px-4 shrink-0 shadow-md">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2 hover:bg-white/5 rounded-full text-app-text transition-all active:scale-90">
             <ChevronLeft size={24} />
          </button>
          <div className="relative group">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl overflow-hidden bg-app-surface ring-1 ring-white/10 group-hover:ring-app-accent/50 transition-all">
                {recipient?.photoURL || chat.photoURL ? (
                  <img src={recipient?.photoURL || chat.photoURL} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-app-accent font-bold text-lg">
                    {recipient ? recipient.displayName[0] : (chat.title?.[0] || <Users size={18} />)}
                  </div>
                )}
              </div>
              <div className="flex flex-col min-w-0">
                <span className="font-bold text-sm tracking-tight truncate w-24 text-white">
                  {recipient ? recipient.displayName : (chat.title || "Group Chat")}
                </span>
                <span className="text-[10px] font-mono text-emerald-400 font-medium">
                  {recipient ? (recipient.isOnline ? t.active : t.disconnected) : `${chat.participants.length} members`}
                </span>
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
           <button onClick={handleSummarize} className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-white/5 text-app-text-muted hover:text-app-accent transition-all group relative">
             <Sparkles size={16} />
             <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 bg-app-surface border border-white/10 px-2 py-1 rounded text-[8px] font-bold opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50">{t.summarize}</span>
           </button>
           <button className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-white/5 text-app-text-muted hover:text-white transition-all"><Zap size={16} /></button>
           <button onClick={() => setShowSettings(true)} className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-white/5 text-app-text-muted hover:text-white transition-all"><MoreVertical size={18} /></button>
        </div>
      </div>

      {/* Messages List Area */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 custom-scrollbar z-10">
        {messages.map((msg, idx) => (
          <MessageItem 
            key={msg.id} 
            msg={msg} 
            isMe={msg.senderId === currentUser.id} 
            recipient={recipient} 
            onReply={() => setReplyTo(msg)}
            onEdit={() => { setEditingMessage(msg); setNewMessage(msg.text); }}
            onReact={(emoji) => handleReaction(msg.id, emoji)}
            onDelete={() => handleDeleteMessage(msg.id)}
            replyMessage={messages.find(m => m.id === msg.replyTo)}
            currentUserId={currentUser.id}
            lang={lang}
          />
        ))}
        <div ref={scrollRef} className="h-4" />
      </div>

      {/* Smart Replies */}
      {smartReplies.length > 0 && !newMessage && (
        <div className="px-4 py-2 flex gap-2 overflow-x-auto no-scrollbar z-20">
          {smartReplies.map((reply, i) => (
            <button 
              key={i} 
              onClick={() => { setNewMessage(reply); handleSend(); }}
              className="bg-app-surface/60 border border-app-accent/30 text-app-accent px-4 py-1.5 rounded-full text-[12px] font-bold whitespace-nowrap hover:bg-app-accent hover:text-[#030406] transition-all"
            >
              {reply}
            </button>
          ))}
        </div>
      )}

      {/* Input Area */}
      <div className="p-3 z-20 space-y-2 bg-[#1f2c33]">
        {/* Reply Preview */}
        <AnimatePresence>
          {replyTo && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="bg-[#111b21] border-l-4 border-app-accent p-2.5 rounded-lg flex justify-between items-center mb-1"
            >
              <div className="min-w-0">
                <span className="text-[10px] font-bold text-app-accent uppercase tracking-widest">{t.replyingTo}</span>
                <p className="text-app-text-muted text-xs truncate">{replyTo.text}</p>
              </div>
              <button onClick={() => setReplyTo(null)} className="p-1 hover:text-white"><X size={14} /></button>
            </motion.div>
          )}
          {editingMessage && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="bg-[#111b21] border-l-4 border-yellow-500 p-2.5 rounded-lg flex justify-between items-center mb-1"
            >
              <div className="min-w-0">
                <span className="text-[10px] font-bold text-yellow-500 uppercase tracking-widest">{t.editing}</span>
                <p className="text-app-text-muted text-xs truncate">{editingMessage.text}</p>
              </div>
              <button onClick={() => { setEditingMessage(null); setNewMessage(""); }} className="p-1 hover:text-white"><X size={14} /></button>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex items-end gap-2">
          <div className="flex-1 bg-[#2a3942] rounded-[24px] px-3 py-1 flex items-end gap-2 relative transition-all">
            <button type="button" onClick={() => setShowEmoji(!showEmoji)} className="p-2 text-[#8696a0] hover:text-white active:scale-90"><Smile size={24} /></button>
            <textarea
              value={newMessage}
              onChange={(e) => handleTyping(e.target.value)}
              placeholder={t.placeholder}
              rows={1}
              className="flex-1 bg-transparent border-none outline-none text-[15px] py-2 resize-none max-h-32 placeholder:text-[#8696a0] text-white"
            />
            <button className="p-2 text-[#8696a0] hover:text-white"><Paperclip size={24} className="-rotate-45" /></button>
            
            {showEmoji && (
              <div className="absolute bottom-[calc(100%+1rem)] left-0 z-50 shadow-2xl rounded-2xl overflow-hidden">
                <EmojiPicker width={300} height={400} theme={"dark" as any} onEmojiClick={(e) => setNewMessage(p => p + e.emoji)} />
              </div>
            )}
          </div>
          <button 
            onClick={handleSend}
            disabled={!newMessage.trim()}
            className="w-12 h-12 bg-[#00a884] text-white rounded-full flex items-center justify-center shrink-0 shadow-lg active:scale-90 transition-all disabled:opacity-30"
          >
            <Send size={24} />
          </button>
        </div>
      </div>
    </div>
  );
}

function MessageItem({ 
  msg, 
  isMe, 
  recipient, 
  onReply, 
  onEdit, 
  onReact, 
  onDelete,
  replyMessage,
  currentUserId,
  lang
}: { 
  msg: Message, 
  isMe: boolean, 
  recipient: User | null, 
  onReply: () => void, 
  onEdit: () => void,
  onReact: (emoji: string) => void,
  onDelete: () => void,
  replyMessage?: Message,
  currentUserId: string,
  lang: "en" | "ar",
  key?: any
}) {
  const [showReactions, setShowReactions] = useState(false);
  const isDeleted = msg.deletedBy?.includes(currentUserId);

  const t = {
    en: {
      deletedMsg: "This message was deleted",
      delete: "Delete"
    },
    ar: {
      deletedMsg: "تم حذف هذه الرسالة",
      delete: "حذف"
    }
  }[lang];

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className={cn(
        "flex w-full group relative", 
        lang === "ar" 
          ? (isMe ? "justify-start" : "justify-end") 
          : (isMe ? "justify-end" : "justify-start")
      )}
    >
      <div className={cn(
        "max-w-[85%] md:max-w-[70%] flex flex-col gap-0.5", 
        lang === "ar"
          ? (isMe ? "items-start" : "items-end")
          : (isMe ? "items-end" : "items-start")
      )}>
        {replyMessage && !isDeleted && (
          <div className={cn("bg-[#111b21] px-3 py-2 rounded-t-lg border-l-4 border-app-accent text-[11px] opacity-80 truncate max-w-xs", isMe ? "mr-1" : "ml-1")}>
             {replyMessage.text}
          </div>
        )}
        <div
          onContextMenu={(e) => { e.preventDefault(); setShowReactions(!showReactions); }}
          className={cn(
            "px-3 py-2 relative shadow-md min-w-[80px]",
            isDeleted ? "bg-[#111b21] text-app-text-muted italic border border-white/5 rounded-lg" : 
            isMe 
              ? "bg-[#005c4b] text-white rounded-lg rounded-tr-none" 
              : "bg-[#202c33] text-white rounded-lg rounded-tl-none border border-white/5"
          )}
        >
          {isDeleted ? (
            <div className="flex items-center gap-2 py-0.5 opacity-60">
              <Trash2 size={12} className="shrink-0" />
              <p className="text-[13px]">{t.deletedMsg}</p>
            </div>
          ) : (
            <>
              <p className="text-[14.5px] leading-[1.4] pr-10">{msg.text}</p>
              <div className="absolute bottom-1 right-2 flex items-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                <span className="text-[9px] font-medium">{formatTime(msg.timestamp)}</span>
                {isMe && recipient && <CheckCheck size={12} className={msg.readBy?.includes(recipient.id) ? "text-[#53bdeb]" : "text-[#8696a0]"} />}
              </div>
            </>
          )}

          {/* Reactions Display */}
          {!isDeleted && msg.reactions && Object.entries(msg.reactions).some(([_, users]) => users.length > 0) && (
            <div className={cn("absolute -bottom-3 flex gap-1", isMe ? "right-1" : "left-1")}>
              {Object.entries(msg.reactions).map(([emoji, users]) => (
                users.length > 0 && (
                  <div key={emoji} className="bg-app-surface border border-white/10 rounded-full px-1.5 py-0.5 text-[10px] flex items-center gap-1 shadow-md">
                    <span>{emoji}</span>
                    {users.length > 1 && <span className="text-[8px] font-bold opacity-60">{users.length}</span>}
                  </div>
                )
              ))}
            </div>
          )}

          {/* Quick Actions Hidden by default */}
          {!isDeleted && (
            <div className={cn(
              "absolute top-0 opacity-0 group-hover:opacity-100 transition-all flex gap-1",
              isMe ? "right-[calc(100%+8px)]" : "left-[calc(100%+8px)]"
            )}>
              <button onClick={onReply} className="p-1.5 hover:bg-white/5 rounded-full text-app-text-muted transition-colors"><Reply size={14} /></button>
              <button onClick={() => setShowReactions(!showReactions)} className="p-1.5 hover:bg-white/5 rounded-full text-app-text-muted transition-colors"><Smile size={14} /></button>
              <button onClick={onDelete} className="p-1.5 hover:bg-red-500/10 rounded-full text-red-500/50 hover:text-red-500 transition-colors"><Trash2 size={14} /></button>
            </div>
          )}
        </div>

        {/* Reactions Picker popover */}
        <AnimatePresence>
          {showReactions && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.8, y: -10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8, y: -10 }}
              className={cn(
                "absolute -top-12 z-[60] bg-app-surface border border-white/10 rounded-full p-1.5 flex gap-1.5 shadow-2xl backdrop-blur-xl",
                isMe ? "right-0" : "left-0"
              )}
            >
              {["❤️", "😂", "😮", "😢", "🔥", "👍"].map(emoji => (
                <button 
                  key={emoji} 
                  onClick={() => { onReact(emoji); setShowReactions(false); }}
                  className="hover:scale-125 transition-transform text-lg px-0.5"
                >
                  {emoji}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// --- Chat Settings Modal ---
function ChatSettingsModal({ 
  onClose, 
  onMute, 
  onArchive, 
  onDelete,
  isMuted,
  isArchived
}: { 
  onClose: () => void;
  onMute: () => void;
  onArchive: () => void;
  onDelete: () => void;
  isMuted: boolean;
  isArchived: boolean;
}) {
  return (
    <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-center overflow-hidden">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/40" 
      />
      <motion.div 
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="w-full max-w-sm bg-app-surface md:rounded-2xl rounded-t-2xl shadow-2xl z-10 flex flex-col"
      >
        <div className="p-4 border-b border-app-border">
          <h3 className="text-app-text font-medium">Chat Settings</h3>
        </div>

        <div className="py-2">
          <SettingsOption 
            icon={isMuted ? Bell : BellOff} 
            label={isMuted ? "Unmute" : "Mute"} 
            onClick={() => { onMute(); onClose(); }}
          />
          <SettingsOption 
            icon={Archive} 
            label={isArchived ? "Unarchive" : "Archive"} 
            onClick={() => { onArchive(); onClose(); }}
          />
          <SettingsOption 
            icon={Trash2} 
            label="Delete Chat" 
            onClick={() => { onDelete(); onClose(); }}
            danger
          />
        </div>
      </motion.div>
    </div>
  );
}

function SettingsOption({ 
  icon: Icon, 
  label, 
  onClick, 
  danger 
}: { 
  icon: any; 
  label: string; 
  onClick: () => void; 
  danger?: boolean;
}) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-4 px-4 py-3 transition-colors text-left",
        danger ? "text-red-500 hover:bg-red-500/5" : "text-app-text hover:bg-white/5"
      )}
    >
      <Icon size={20} className={danger ? "text-red-500" : "text-app-text-muted"} />
      <span className="text-sm font-medium">{label}</span>
    </button>
  );
}

// --- Profile View: Edit Display Name & Username ---
function ProfileView({ 
  user, 
  onBack, 
  onLogout,
  theme,
  setTheme,
  lang,
  setLang
}: { 
  user: User, 
  onBack: () => void, 
  onLogout: () => void,
  theme: "dark" | "light",
  setTheme: (t: "dark" | "light") => void,
  lang: "en" | "ar",
  setLang: (l: "en" | "ar") => void
}) {
  const [displayName, setDisplayName] = useState(user.displayName);
  const [username, setUsername] = useState(user.username);
  const [photoURL, setPhotoURL] = useState(user.photoURL || "");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  const t = {
    en: {
      back: "return to node",
      systemAlias: "System Alias",
      identityKey: "Identity Key",
      avatarUri: "Avatar URI",
      save: "commit neural link",
      logout: "terminate session",
      success: "Core data refactored",
      fail: "Transmission failed",
      theme: "Interface Mode",
      language: "Data Language",
      dark: "Dark Mode",
      light: "Light Mode"
    },
    ar: {
      back: "العودة للقائمة",
      systemAlias: "الاسم المستعار",
      identityKey: "مفتاح الهوية",
      avatarUri: "رابط الصورة",
      save: "حفظ البيانات",
      logout: "إنهاء الجلسة",
      success: "تم تحديث البيانات",
      fail: "فشل الإرسال",
      theme: "وضع الواجهة",
      language: "لغة البيانات",
      dark: "الوضع الداكن",
      light: "الوضع الفاتح"
    }
  }[lang];

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMsg("");
    const cleanUsername = username.trim().toLowerCase().replace(/^@/, "");

    try {
      if (cleanUsername !== user.username) {
        const usernameRef = doc(db, COLLECTIONS.USERNAMES, cleanUsername);
        const nameSnap = await getDoc(usernameRef);
        if (nameSnap.exists()) {
          setMsg(lang === "en" ? "Identity conflict detected" : "هذا الاسم مستخدم بالفعل");
          setLoading(false);
          return;
        }
        await setDoc(doc(db, COLLECTIONS.USERNAMES, cleanUsername), { uid: user.id });
      }

      const userRef = doc(db, COLLECTIONS.USERS, user.id);
      await updateDoc(userRef, {
        displayName: displayName.trim(),
        username: cleanUsername,
        photoURL: photoURL.trim()
      });
      
      setMsg(t.success);
    } catch (err) {
      console.error(err);
      setMsg(t.fail);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 bg-app-bg overflow-y-auto px-6 py-12 w-full relative h-full">
       <div className="absolute top-0 right-0 w-full h-[300px] bg-app-accent/5 blur-[100px] rounded-full pointer-events-none" />
       
       <button onClick={onBack} className="flex items-center gap-2 text-app-accent font-bold uppercase tracking-widest text-[11px] hover:text-white transition-all group z-20 mb-10">
          <ChevronLeft size={18} />
          <span>{t.back}</span>
       </button>
       
       <div className="space-y-10 relative z-10 w-full">
         <div className="flex flex-col items-center gap-6">
            <div className="relative group">
               <motion.div 
                 whileHover={{ scale: 1.05 }}
                 className="w-32 h-32 rounded-[40px] bg-gradient-to-tr from-app-surface to-white/5 p-1 relative shadow-2xl"
               >
                 <div className="w-full h-full rounded-[36px] bg-app-bg flex items-center justify-center overflow-hidden border border-white/5 ring-inset">
                    {photoURL ? (
                      <img src={photoURL} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-app-surface text-app-accent font-black text-4xl">{displayName[0]}</div>
                    )}
                 </div>
                 <button className="absolute -bottom-2 -right-2 bg-app-accent p-2.5 rounded-2xl shadow-xl ring-4 ring-app-bg hover:scale-110 transition-transform">
                   <Camera size={18} className="text-[#030406]" />
                 </button>
               </motion.div>
            </div>
            <div className="text-center space-y-1">
               <h1 className="text-2xl font-black tracking-tight text-white">{displayName}</h1>
               <p className="text-[11px] font-mono font-bold uppercase text-app-accent bg-app-accent/5 px-3 py-1 rounded-full border border-app-accent/20">@{username}</p>
            </div>
         </div>

         {/* Settings Section */}
         <div className="grid grid-cols-2 gap-3 mb-6">
            <button 
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="flex flex-col items-center justify-center gap-2 p-4 bg-app-surface/40 border border-white/5 rounded-3xl hover:bg-app-surface transition-all"
            >
              <div className="text-app-accent">
                {theme === "dark" ? <Moon size={20} /> : <Sun size={20} />}
              </div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-app-text-muted">{theme === "dark" ? t.dark : t.light}</span>
            </button>
            <button 
              onClick={() => setLang(lang === "en" ? "ar" : "en")}
              className="flex flex-col items-center justify-center gap-2 p-4 bg-app-surface/40 border border-white/5 rounded-3xl hover:bg-app-surface transition-all"
            >
              <div className="text-app-accent">
                <Languages size={20} />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-app-text-muted">{lang === "en" ? "English" : "العربية"}</span>
            </button>
         </div>

         <form onSubmit={handleSave} className="space-y-6">
            <div className="space-y-5">
               <div className="space-y-2">
                 <label className="text-[10px] font-bold uppercase text-app-text-muted tracking-[0.2em] ml-1 opacity-60">{t.systemAlias}</label>
                 <input 
                    type="text" 
                    value={displayName} 
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full bg-app-surface/50 border border-white/5 rounded-2xl p-4 text-sm font-semibold focus:ring-2 focus:ring-app-accent/40 outline-none transition-all placeholder:text-app-text-muted/20"
                 />
               </div>
               <div className="space-y-2">
                 <label className="text-[10px] font-bold uppercase text-app-text-muted tracking-[0.2em] ml-1 opacity-60">{t.identityKey}</label>
                 <div className="relative">
                   <span className={cn("absolute top-1/2 -translate-y-1/2 text-app-accent/40 font-bold text-sm", lang === "ar" ? "right-4" : "left-4")}>@</span>
                   <input 
                     type="text" 
                     value={username} 
                     onChange={(e) => setUsername(e.target.value)}
                     className={cn("w-full bg-app-surface/50 border border-white/5 rounded-2xl p-4 text-sm font-semibold focus:ring-2 focus:ring-app-accent/40 outline-none transition-all", lang === "ar" ? "pr-10 pl-4" : "pl-10 pr-4")}
                   />
                 </div>
               </div>
               <div className="space-y-2">
                 <label className="text-[10px] font-bold uppercase text-app-text-muted tracking-[0.2em] ml-1 opacity-60">{t.avatarUri}</label>
                 <input 
                    type="text" 
                    value={photoURL} 
                    onChange={(e) => setPhotoURL(e.target.value)}
                    className="w-full bg-app-surface/50 border border-white/5 rounded-2xl p-4 text-sm font-semibold focus:ring-2 focus:ring-app-accent/40 outline-none transition-all"
                 />
               </div>
            </div>

            {msg && <p className={cn("text-[10px] font-bold uppercase tracking-widest text-center animate-pulse", msg.includes("failed") || msg.includes("conflict") ? "text-red-400" : "text-app-accent")}>{msg}</p>}

            <div className="flex flex-col gap-3 pt-4">
              <button 
                type="submit" 
                disabled={loading}
                className="w-full bg-app-accent text-[#030406] font-bold uppercase tracking-widest py-4 rounded-2xl shadow-xl hover:glow-accent active:scale-[0.98] transition-all disabled:opacity-50 text-[11px]"
              >
                {loading ? "syncing..." : t.save}
              </button>
              <button 
                type="button" 
                onClick={onLogout}
                className="w-full bg-red-500/5 text-red-400 font-bold uppercase tracking-widest py-4 rounded-2xl border border-red-500/10 hover:bg-red-500/10 transition-all flex items-center justify-center gap-2 text-[11px]"
              >
                <LogOut size={16} /> {t.logout}
              </button>
            </div>
         </form>
       </div>
    </div>
  );
}
