"use client";
import { useState, useEffect } from "react";
import axios from "axios";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export default function Chatbot() {
  const [input, setInput] = useState<string>("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [userId, setUserId] = useState<string | null>(null);
  const router = useRouter();


  useEffect(() => {
    const fetchUserAndChatHistory = async () => {
      const { data, error } = await supabase.auth.getUser();
      if (data?.user?.id) {
        setUserId(data.user.id);
        loadChatHistory(data.user.id); // Load chat history
      } else {
        console.error("Error fetching user:", error);
        router.push("/login"); // Redirect if not logged in
      }
    };
    fetchUserAndChatHistory();
  }, [router]);

 
  const loadChatHistory = async (userId: string) => {
  const { data, error } = await supabase
    .from("chat_history")
    .select("message, response")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Error fetching chat history:", error);
    return;
  }

  // ✅ Explicitly typecast `role` to match Message type
  const chatMessages: Message[] = data.flatMap((chat) => [
    { role: "user", content: chat.message } as const,
    { role: "assistant", content: chat.response } as const,
  ]);

  setMessages(chatMessages);
};


  // ✅ Send Message and Save to Supabase
  const sendMessage = async () => {
    if (!input.trim() || !userId) return;

    const newMessage: Message = { role: "user", content: input };
    setMessages((prev) => [...prev, newMessage]);
    setLoading(true);

    try {
      const response = await axios.post("/api/chat", {
        userMessage: input,
        userId,
      });

      const botResponse: Message = { role: "assistant", content: response.data.message };
      setMessages((prev) => [...prev, botResponse]);

      
      await supabase.from("chat_history").insert([
        { user_id: userId, message: input, response: response.data.message },
      ]);
    } catch (error) {
      console.error("Erreur API :", error);
      setMessages((prev) => [...prev, { role: "assistant", content: "❌ Erreur : Impossible de répondre." }]);
    }

    setLoading(false);
    setInput("");
  };


  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-4 relative">
     
      <div className="absolute top-4 right-4">
        <Button onClick={handleLogout} className="bg-red-500 text-white px-4 py-2 rounded">
          Logout
        </Button>
      </div>

      <Card className="w-full max-w-lg bg-white shadow-md rounded-lg p-4">
        <h1 className="text-xl font-bold mb-4 text-center">Chatbot Météo Maison</h1>
        <div className="h-64 overflow-y-auto border p-2 mb-4 bg-gray-50 rounded">
          {messages.map((msg, index) => (
            <p key={index} className={msg.role === "user" ? "text-blue-600" : "text-green-600"}>
              <strong>{msg.role === "user" ? "you" : "Bot"}:</strong> {msg.content}
            </p>
          ))}
          {loading && <p className="text-gray-500"> Chargement...</p>}
        </div>
        <div className="flex gap-2">
          <Input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && sendMessage()}
            className="border p-2 w-full rounded"
            disabled={loading}
          />
          <Button onClick={sendMessage} className="bg-blue-500 text-white py-2 px-4 rounded" disabled={loading}>
            {loading ? "..." : "Envoyer"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
