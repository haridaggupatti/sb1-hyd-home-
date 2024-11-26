import OpenAI from 'openai';
import { delay } from '../utils/helpers';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: import.meta.env.VITE_OPENAI_API_KEY,
  dangerouslyAllowBrowser: true
});

// Memory store for conversations
interface ConversationMemory {
  messages: any[];
  context: string;
  lastActive: number;
}

const conversationMemory: Record<string, ConversationMemory> = {};

// Shared user store with persistent storage
const USER_STORE_KEY = 'user_store';

const userStore = {
  users: JSON.parse(localStorage.getItem(USER_STORE_KEY) || JSON.stringify({
    'test@example.com': {
      id: '1',
      password: 'password123',
      role: 'user',
      isActive: true,
      createdAt: '2024-03-01T00:00:00Z',
      lastLoginAt: '2024-03-19T10:00:00Z',
      loginCount: 5,
      expiresAt: '2025-03-01'
    },
    'admin@example.com': {
      id: '2',
      password: 'admin123',
      role: 'admin',
      isActive: true,
      createdAt: '2024-03-01T00:00:00Z',
      lastLoginAt: '2024-03-19T11:00:00Z',
      loginCount: 10,
      expiresAt: '2025-03-01'
    }
  })),

  save() {
    localStorage.setItem(USER_STORE_KEY, JSON.stringify(this.users));
  },

  addUser(email: string, userData: any) {
    this.users[email] = {
      ...userData,
      loginCount: 0,
      lastLoginAt: null
    };
    this.save();
  },

  updateUser(email: string, userData: any) {
    if (this.users[email]) {
      this.users[email] = {
        ...this.users[email],
        ...userData
      };
      this.save();
    }
  },

  deleteUser(email: string) {
    delete this.users[email];
    this.save();
  },

  getUser(email: string) {
    return this.users[email];
  },

  isUserExpired(user: any): boolean {
    if (!user.expiresAt) return false;
    const expiryDate = new Date(user.expiresAt);
    return expiryDate < new Date();
  }
};

// Auth API
export const authApi = {
  login: async (email: string, password: string) => {
    await delay(800);

    const user = userStore.getUser(email);
    if (!user || user.password !== password || !user.isActive) {
      throw new Error('Invalid email or password');
    }

    // Check if user account has expired
    if (userStore.isUserExpired(user)) {
      throw new Error('Your account has expired. Please contact an administrator.');
    }

    // Update login stats
    userStore.updateUser(email, {
      lastLoginAt: new Date().toISOString(),
      loginCount: (user.loginCount || 0) + 1
    });

    const token = btoa(JSON.stringify({ 
      id: user.id,
      email, 
      role: user.role,
      expiresAt: user.expiresAt
    }));
    localStorage.setItem('access_token', token);

    return {
      user: {
        id: user.id,
        email,
        role: user.role,
        isActive: user.isActive,
        lastLoginAt: user.lastLoginAt,
        loginCount: user.loginCount,
        expiresAt: user.expiresAt
      },
      token
    };
  },

  logout: () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('session_id');
  },

  getCurrentUser: () => {
    const token = localStorage.getItem('access_token');
    if (!token) return null;

    try {
      const { id, email, role, expiresAt } = JSON.parse(atob(token));
      const user = userStore.getUser(email);
      
      // Check if user has expired during their session
      if (userStore.isUserExpired(user)) {
        localStorage.removeItem('access_token');
        return null;
      }

      return user ? {
        id,
        email,
        role,
        isActive: user.isActive,
        lastLoginAt: user.lastLoginAt,
        loginCount: user.loginCount,
        expiresAt
      } : null;
    } catch {
      localStorage.removeItem('access_token');
      return null;
    }
  }
};

// User management API
export const userApi = {
  getUsers: async () => {
    await delay(1000);
    return Object.entries(userStore.users).map(([email, user]) => ({
      id: user.id,
      email,
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
      loginCount: user.loginCount,
      expiresAt: user.expiresAt
    }));
  },

  createUser: async (userData: any) => {
    await delay(800);
    const id = `user_${Date.now()}`;
    userStore.addUser(userData.email, {
      ...userData,
      id,
      createdAt: new Date().toISOString()
    });
    return { ...userData, id };
  },

  updateUser: async (id: string, userData: any) => {
    await delay(800);
    const user = Object.entries(userStore.users).find(([_, u]) => u.id === id);
    if (user) {
      userStore.updateUser(user[0], userData);
      return { ...userData, id };
    }
    throw new Error('User not found');
  },

  deleteUser: async (id: string) => {
    await delay(800);
    const user = Object.entries(userStore.users).find(([_, u]) => u.id === id);
    if (user) {
      userStore.deleteUser(user[0]);
      return { success: true };
    }
    throw new Error('User not found');
  }
};

// Admin API
export const adminApi = {
  getStats: async () => {
    await delay(1000);
    const users = Object.values(userStore.users);
    return {
      totalUsers: users.length,
      activeUsers: users.filter(u => u.isActive).length,
      adminUsers: users.filter(u => u.role === 'admin').length,
      recentLogins: [
        { date: '2024-03-15', count: 3 },
        { date: '2024-03-16', count: 5 },
        { date: '2024-03-17', count: 4 },
        { date: '2024-03-18', count: 7 },
        { date: '2024-03-19', count: 6 }
      ]
    };
  }
};

// Interview API
export const interviewApi = {
  uploadResume: async (content: string) => {
    await delay(1000);
    const sessionId = `session_${Date.now()}`;
    localStorage.setItem(`resume_${sessionId}`, content);
    
    // Initialize conversation memory
    conversationMemory[sessionId] = {
      messages: [],
      context: content,
      lastActive: Date.now()
    };
    
    return {
      session_id: sessionId,
      status: 'success'
    };
  },

  getAnswer: async (question: string, sessionId: string) => {
    await delay(1500);
    
    const memory = conversationMemory[sessionId];
    if (!memory) {
      throw new Error('Session not found or expired');
    }

    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: `I'm the recruiter asking questions to assess your skills and expertise. Based on this resume:\n\n${memory.context}\n\nRespond to any technical or non-technical question in normal Indian slang English in a concise manner, and conversational manner, as if we're speaking face-to-face, showcasing your achievements, skills, and problem-solving abilities based on question. Respond without using any large and complicated vocabulary, complicated words and complicated terminologies in the speech, and give the answer short and concise without dramatic words. Don't give any answer like a text book answer, if possible give with real world example. Answer my questions as you are a human, maintaining the persona of the actual candidate.`
          },
          ...memory.messages,
          { role: "user", content: question }
        ],
        temperature: 0.8,
        max_tokens: 500,
        presence_penalty: 0.6,
        frequency_penalty: 0.4
      });

      const response = completion.choices[0]?.message?.content || 'I apologize, but I am unable to process your request at the moment.';
      
      // Update conversation memory
      memory.messages.push(
        { role: "user", content: question },
        { role: "assistant", content: response }
      );
      memory.lastActive = Date.now();

      return {
        response,
        status: 'success'
      };
    } catch (error: any) {
      console.error('OpenAI API error:', error);
      throw new Error(error.message);
    }
  },

  clearConversation: (sessionId: string) => {
    delete conversationMemory[sessionId];
  }
};