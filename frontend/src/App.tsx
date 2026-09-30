import { useEffect, useRef, useState } from "react";
import {
  Search, Plus, Image as ImageIcon, Camera, FileText, FolderOpen, Mic,
  Send, Volume2, Square, Leaf, CloudSun, MapPin, Wifi, X, Languages,
  MoreHorizontal, CalendarClock, PlugZap, FolderKanban, Code2, LibraryBig,
  Paperclip, Menu, Sun, Moon, Video
} from "lucide-react";
import "./App.css";

type Message = {
  id: string;
  role: "user" | "assistant";
  text: string;
  image?: string | null;
  fileName?: string;
  isVoice?: boolean;
};

type Chat = { id: string; title: string; messages: Message[] };
const API = "http://127.0.0.1:8000";

function App() {
  const [location, setLocation] = useState("Tap to detect location");
  const [language, setLanguage] = useState("ta-IN");
  const [chats, setChats] = useState<Chat[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const [showLanguageMenu, setShowLanguageMenu] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);

  const recognitionRef = useRef<any>(null);
  const speechRef = useRef<SpeechSynthesisUtterance | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const languages = [
    ["ta-IN", "தமிழ்"], ["en-IN", "English"], ["hi-IN", "हिन्दी"], ["te-IN", "తెలుగు"],
    ["kn-IN", "ಕನ್ನಡ"], ["ml-IN", "മലയാളം"], ["mr-IN", "मराठी"], ["bn-IN", "বাংলা"],
    ["gu-IN", "ગુજરાતી"], ["pa-IN", "ਪੰਜਾਬੀ"],
  ];

  const cleanAIText = (text: string) => text
    .replace(/\*\*(.*?)\*\*/g, "$1").replace(/\*(.*?)\*/g, "$1")
    .replace(/__(.*?)__/g, "$1").replace(/_(.*?)_/g, "$1")
    .replace(/`([^`]+)`/g, "$1").replace(/^#{1,6}\s*/gm, "")
    .replace(/^\s*[-•]\s*/gm, "").replace(/^\s*\d+\.\s*/gm, "")
    .replace(/\[(.*?)\]\(.*?\)/g, "$1").replace(/\n{3,}/g, "\n\n").trim();

  const stopSpeaking = () => {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    speechRef.current = null;
  };

  const getSpeechVoice = (lang: string) => {
    if (!("speechSynthesis" in window)) return null;
    const voices = window.speechSynthesis.getVoices();
    if (!voices.length) return null;

    const base = lang.split("-")[0].toLowerCase();
    return (
      voices.find(v => v.lang.toLowerCase() === lang.toLowerCase()) ||
      voices.find(v => v.lang.toLowerCase().startsWith(`${base}-`)) ||
      voices.find(v => v.lang.toLowerCase() === base) ||
      null
    );
  };

  const speakAnswer = (text: string) => {
    if (!("speechSynthesis" in window) || !text.trim()) return;

    stopSpeaking();

    const clean = cleanAIText(text).replace(/\\s+/g, " ").trim();
    if (!clean) return;

    // Long browser TTS utterances can stop or become unclear.
    // Split at sentence boundaries and speak one short chunk at a time.
    const sentences = clean.match(/[^.!?。！？]+[.!?。！？]?/g) || [clean];
    const chunks: string[] = [];
    let current = "";

    for (const sentence of sentences) {
      const part = sentence.trim();
      if (!part) continue;

      if ((current + " " + part).trim().length <= 180) {
        current = (current + " " + part).trim();
      } else {
        if (current) chunks.push(current);
        if (part.length <= 180) {
          current = part;
        } else {
          for (let i = 0; i < part.length; i += 160) {
            chunks.push(part.slice(i, i + 160));
          }
          current = "";
        }
      }
    }
    if (current) chunks.push(current);

    const speakChunk = (index: number) => {
      if (index >= chunks.length) {
        speechRef.current = null;
        return;
      }

      const utterance = new SpeechSynthesisUtterance(chunks[index]);
      utterance.lang = language;
      utterance.rate = 0.86;
      utterance.pitch = 1;
      utterance.volume = 1;

      const voice = getSpeechVoice(language);
      if (voice) utterance.voice = voice;

      utterance.onend = () => {
        if (speechRef.current === utterance) speakChunk(index + 1);
      };
      utterance.onerror = () => {
        if (speechRef.current === utterance) speechRef.current = null;
      };

      speechRef.current = utterance;
      window.speechSynthesis.speak(utterance);
    };

    // Chrome sometimes loads the voice list slightly after page load.
    if (!window.speechSynthesis.getVoices().length) {
      window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.onvoiceschanged = null;
        speakChunk(0);
      };
    } else {
      speakChunk(0);
    }
  };

  const createNewChat = () => {
    stopSpeaking();
    if (recognitionRef.current) { try { recognitionRef.current.abort(); } catch {} }
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const chat: Chat = {
      id, title: "New Conversation",
      messages: [{ id: `${id}-welcome`, role: "assistant", text: "Welcome to AgriN. How can I help you today?" }],
    };
    setChats(prev => [chat, ...prev]);
    setCurrentChatId(id);
    setMessage(""); setAttachedImage(null); setAttachedFile(null); setShowPlusMenu(false);
    window.setTimeout(() => speakAnswer(chat.messages[0].text), 250);
  };

  useEffect(() => {
    try {
      const saved = localStorage.getItem("agrin-chats-v5");
      if (saved) {
        const parsed = JSON.parse(saved) as Chat[];
        if (Array.isArray(parsed) && parsed.length) { setChats(parsed); setCurrentChatId(parsed[0].id); return; }
      }
    } catch {}
    createNewChat();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { if (chats.length) localStorage.setItem("agrin-chats-v5", JSON.stringify(chats)); }, [chats]);

  useEffect(() => () => {
    if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop());
    if (recognitionRef.current) { try { recognitionRef.current.abort(); } catch {} }
  }, []);

  const currentChat = chats.find(chat => chat.id === currentChatId) || null;
  const filteredChats = chats.filter(chat => {
    const q = searchQuery.trim().toLowerCase();
    return !q || chat.title.toLowerCase().includes(q) || chat.messages.some(m => m.text.toLowerCase().includes(q));
  });

  const askAgriN = async (text: string, imageData?: string | null, fileName?: string, voice = false) => {
    const trimmed = text.trim();
    if (!trimmed && !imageData && !fileName) return;
    let activeId = currentChatId;
    if (!activeId) {
      activeId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const newChat: Chat = { id: activeId, title: "New Conversation", messages: [] };
      setChats(prev => [newChat, ...prev]);
      setCurrentChatId(activeId);
    }

    const userMessage: Message = {
      id: `${Date.now()}-user`, role: "user",
      text: trimmed || (imageData ? "Please explain this image." : `Attached: ${fileName}`),
      image: imageData || null, fileName, isVoice: voice,
    };
    setChats(prev => prev.map(chat => chat.id === activeId ? {
      ...chat,
      title: chat.title === "New Conversation" ? (trimmed || fileName || "Crop image").slice(0, 42) : chat.title,
      messages: [...chat.messages, userMessage],
    } : chat));
    setMessage(""); setAttachedImage(null); setAttachedFile(null); setShowPlusMenu(false); setIsThinking(true);

    try {
      const response = await fetch(imageData ? `${API}/analyze-image` : `${API}/ask`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(imageData
          ? { image: imageData, question: trimmed || "Explain this crop image and identify visible crop health or disease signs.", language }
          : { question: trimmed || `Please help with the attached file: ${fileName}`, language }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || `Server returned ${response.status}`);
      const answer = cleanAIText(data.answer || "I could not generate an answer.");
      setChats(prev => prev.map(chat => chat.id === activeId ? {
        ...chat, messages: [...chat.messages, { id: `${Date.now()}-assistant`, role: "assistant", text: answer }]
      } : chat));
      setIsThinking(false);
      speakAnswer(answer);
    } catch (error) {
      console.error(error);
      const detail = error instanceof Error ? error.message : "Unknown error";
      const answer = detail.includes("GEMINI_API_KEY is not configured")
        ? "AgriN AI key is not loaded in the backend. Please restart FastAPI after setting the Gemini API key."
        : detail.includes("Failed to fetch")
          ? "AgriN server is not reachable. Please make sure FastAPI is running on port 8000."
          : `AgriN could not complete the request right now. ${detail}`;
      setChats(prev => prev.map(chat => chat.id === activeId ? {
        ...chat, messages: [...chat.messages, { id: `${Date.now()}-error`, role: "assistant", text: answer }]
      } : chat));
      setIsThinking(false); speakAnswer(answer);
    }
  };

  const handleSend = () => {
    if (isThinking) return;
    if (!message.trim() && !attachedImage && !attachedFile) return;
    askAgriN(message, attachedImage, attachedFile?.name, false);
  };

  const startVoice = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) { alert("Voice recognition is not supported. Please use Chrome or Edge."); return; }
    stopSpeaking();
    if (recognitionRef.current) { try { recognitionRef.current.abort(); } catch {} }
    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition; recognition.lang = language; recognition.continuous = false; recognition.interimResults = true;
    setIsListening(true);
    let finalText = "";
    recognition.onresult = (event: any) => {
      let transcript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) transcript += event.results[i][0].transcript;
      setMessage(transcript.trim());
      if (event.results[event.results.length - 1].isFinal) { finalText = transcript.trim(); setIsListening(false); recognitionRef.current = null; askAgriN(finalText, null, undefined, true); }
    };
    recognition.onerror = (event: any) => { setIsListening(false); recognitionRef.current = null; if (event.error !== "aborted") console.log(event.error); };
    recognition.onend = () => { setIsListening(false); if (recognitionRef.current === recognition) recognitionRef.current = null; };
    try { recognition.start(); } catch { setIsListening(false); }
  };

  const getLocation = () => {
    if (!navigator.geolocation) { setLocation("Location not supported"); return; }
    setLocation("Detecting...");
    navigator.geolocation.getCurrentPosition(position => {
      const { latitude, longitude } = position.coords;
      setLocation(`${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
    }, () => setLocation("Location permission denied"));
  };

  const selectFile = (file?: File) => {
    if (!file) return;
    if (file.type.startsWith("image/")) {
      const reader = new FileReader(); reader.onload = () => setAttachedImage(String(reader.result)); reader.readAsDataURL(file);
    } else setAttachedFile(file);
    setShowPlusMenu(false); composerRef.current?.focus();
  };

  const openCamera = async () => {
    setShowPlusMenu(false);
    if (!navigator.mediaDevices?.getUserMedia) { cameraInputRef.current?.click(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      streamRef.current = stream; setCameraOpen(true); setCameraReady(false);
      requestAnimationFrame(() => {
        if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play().catch(() => {}); setCameraReady(true); }
      });
    } catch (error) {
      console.error(error);
      alert("Camera access was blocked. Please allow camera permission in the browser and try again.");
      cameraInputRef.current?.click();
    }
  };

  const closeCamera = () => {
    streamRef.current?.getTracks().forEach(track => track.stop()); streamRef.current = null;
    setCameraOpen(false); setCameraReady(false);
  };

  const captureCamera = () => {
    const video = videoRef.current;
    if (!video || !cameraReady) return;
    const canvas = document.createElement("canvas"); canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
    setAttachedImage(canvas.toDataURL("image/jpeg", 0.9)); closeCamera(); composerRef.current?.focus();
  };

  const openRecentChat = (chat: Chat) => {
    stopSpeaking(); setCurrentChatId(chat.id); setShowPlusMenu(false); setAttachedImage(null); setAttachedFile(null);
  };

  return (
    <div className={`app ${darkMode ? "dark" : ""}`}>
      <aside className={`sidebar ${sidebarOpen ? "open" : "closed"}`}>
        <div className="sidebar-scroll">
          <div className="sidebar-topbar">
            <button className="sidebar-brand-button" onClick={() => setSearchQuery("")}><span className="sidebar-logo"><Leaf size={20} /></span><span className="sidebar-brand-name">AgriN</span></button>
            <button className="sidebar-search-button" onClick={() => { setSearchOpen(true); setTimeout(() => searchRef.current?.focus(), 0); }}><Search size={20} /></button>
          </div>
          {searchOpen && <div className="chat-search-box"><Search size={16}/><input ref={searchRef} value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search chats"/><button onClick={() => {setSearchQuery("");setSearchOpen(false)}}><X size={15}/></button></div>}

          <button className="new-chat-button" onClick={createNewChat}><Plus size={19}/><span>New chat</span></button>

          <div className="sidebar-section-title">Tools</div>
          <div className="sidebar-features">
            <button className="sidebar-feature" onClick={() => imageInputRef.current?.click()}><ImageIcon size={19}/><span>Images</span></button>
            <button className="sidebar-feature" onClick={startVoice}><Mic size={19}/><span>Voice Assistant</span></button>
            <button className="sidebar-feature" onClick={getLocation}><CloudSun size={19}/><span>Weather</span></button>
            <button className="sidebar-feature" onClick={getLocation}><MapPin size={19}/><span>Farm Location</span></button>
            <button className="sidebar-feature" onClick={() => setShowLanguageMenu(v => !v)}><Languages size={19}/><span>Languages</span></button>
            {showLanguageMenu && <div className="sidebar-language-box"><select value={language} onChange={e => {stopSpeaking();setLanguage(e.target.value)}}>{languages.map(([code,name]) => <option key={code} value={code}>{name}</option>)}</select></div>}
            <button className="sidebar-feature"><Wifi size={19}/><span>Offline Mode</span></button>
            <button className="sidebar-feature"><LibraryBig size={19}/><span>Agri Library</span></button>
            <button className="sidebar-feature"><CalendarClock size={19}/><span>Scheduled</span></button>
            <button className="sidebar-feature"><PlugZap size={19}/><span>Integrations</span></button>
            <button className="sidebar-feature"><FolderKanban size={19}/><span>Farm Projects</span></button>
            <button className="sidebar-feature"><Code2 size={19}/><span>Agri Tools</span></button>
            <button className="sidebar-feature"><MoreHorizontal size={19}/><span>More</span></button>
          </div>

          <div className="sidebar-section-title recent-title">Recents</div>
          <div className="recent-list">{filteredChats.length ? filteredChats.map(chat => <button key={chat.id} className={`recent-chat ${currentChatId === chat.id ? "selected" : ""}`} onClick={() => openRecentChat(chat)}><span className="recent-chat-title">{chat.title || "New Conversation"}</span></button>) : <div className="recent-empty">No matching chats</div>}</div>
          <div className="sidebar-footer"><Leaf size={17}/><div><strong>AgriN AI</strong><small>Farmer-first intelligence</small></div></div>
        </div>
      </aside>

      <button className="sidebar-toggle" onClick={() => setSidebarOpen(v => !v)}>{sidebarOpen ? "‹" : "›"}</button>
      <div className="app-content">
        <header className="header">
          <div className="mobile-header-left"><button className="mobile-menu" onClick={() => setSidebarOpen(v => !v)}><Menu size={21}/></button><div className="brand"><div className="logo"><Leaf size={24}/></div><div><h1>AgriN</h1><p>AI Agriculture Intelligence</p></div></div></div>
          <div className="header-actions">
            <button className="header-location" onClick={getLocation}><MapPin size={17}/><span>{location}</span></button>
            <button className="theme-button" onClick={() => setDarkMode(v => !v)} title="Toggle theme">{darkMode ? <Sun size={18}/> : <Moon size={18}/>}</button>
          </div>
        </header>

        <main className="main">
          <div className="chat-header-row"><div><h2>{currentChat?.title || "New Conversation"}</h2><p>AgriN AI • {languages.find(x => x[0] === language)?.[1]}</p></div></div>
          <section className="chat-panel">
            {(currentChat?.messages || []).map(item => <div key={item.id} className={`message-row ${item.role}`}><div className="message-avatar">{item.role === "assistant" ? <Leaf size={17}/> : "You"}</div><div className="message-content">{item.image && <img className="message-image" src={item.image} alt="Uploaded crop"/>}{item.fileName && <div className="attached-file"><Paperclip size={15}/>{item.fileName}</div>}<div className="message-text">{item.text}</div>{item.role === "user" && item.isVoice && <span className="voice-message-label"><Mic size={13}/> Voice message</span>}{item.role === "assistant" && <button className="message-speak" onClick={() => speakAnswer(item.text)}><Volume2 size={16}/></button>}</div></div>)}
            {isThinking && <div className="message-row assistant"><div className="message-avatar"><Leaf size={17}/></div><div className="message-content"><div className="typing-dots"><span/><span/><span/></div></div></div>}
          </section>
        </main>
      </div>

      <div className="composer-wrap">
        {attachedImage && <div className="attachment-preview"><img src={attachedImage} alt="Selected"/><button onClick={() => setAttachedImage(null)}><X size={15}/></button></div>}
        {attachedFile && <div className="file-preview"><Paperclip size={16}/>{attachedFile.name}<button onClick={() => setAttachedFile(null)}><X size={15}/></button></div>}
        {showPlusMenu && <div className="plus-menu"><button onClick={() => imageInputRef.current?.click()}><ImageIcon size={19}/><span>Image</span></button><button onClick={openCamera}><Camera size={19}/><span>Camera</span></button><button onClick={() => fileInputRef.current?.click()}><FolderOpen size={19}/><span>File</span></button><button onClick={() => documentInputRef.current?.click()}><FileText size={19}/><span>Document</span></button></div>}
        <div className="composer"><button className="composer-plus" onClick={() => setShowPlusMenu(v => !v)}><Plus size={22}/></button><textarea ref={composerRef} value={message} onChange={e => setMessage(e.target.value)} onKeyDown={e => {if(e.key === "Enter" && !e.shiftKey){e.preventDefault();handleSend()}}} placeholder={isListening ? "Listening... speak now" : "Message AgriN..."} rows={1}/><button className={`composer-mic ${isListening ? "listening" : ""}`} onClick={startVoice}>{isListening ? <Square size={18}/> : <Mic size={20}/>}</button><button className="composer-send" onClick={handleSend} disabled={isThinking || (!message.trim() && !attachedImage && !attachedFile)}><Send size={19}/></button></div>
      </div>

      <input ref={imageInputRef} type="file" accept="image/*" hidden onChange={e => selectFile(e.target.files?.[0])}/>
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" hidden onChange={e => selectFile(e.target.files?.[0])}/>
      <input ref={fileInputRef} type="file" hidden onChange={e => selectFile(e.target.files?.[0])}/>
      <input ref={documentInputRef} type="file" accept=".pdf,.doc,.docx,.txt,.csv,.xlsx" hidden onChange={e => selectFile(e.target.files?.[0])}/>

      {cameraOpen && <div className="camera-overlay"><div className="camera-modal"><div className="camera-head"><div><Video size={19}/><strong>Camera</strong></div><button onClick={closeCamera}><X size={20}/></button></div><video ref={videoRef} autoPlay playsInline muted/><div className="camera-actions"><button className="camera-close" onClick={closeCamera}>Cancel</button><button className="camera-capture" onClick={captureCamera} disabled={!cameraReady}><Camera size={18}/> Capture</button></div><p>Allow camera access when your browser asks for permission.</p></div></div>}
    </div>
  );
}

export default App;
