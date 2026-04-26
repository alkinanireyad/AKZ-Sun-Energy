import { createChatBotMessage } from 'react-chatbot-kit';

const config = {
  botName: 'مساعد التركيب',
  initialMessages: [
    createChatBotMessage('مرحبا! أنا مساعد التركيب الذكي. كيف يمكنني مساعدتك في تحديات تركيب المنظومة الشمسية؟', {}),
  ],
  customStyles: {
    botMessageBox: {
      backgroundColor: '#001f3f',
    },
    chatButton: {
      backgroundColor: '#f59e0b',
    },
  },
};

export default config;