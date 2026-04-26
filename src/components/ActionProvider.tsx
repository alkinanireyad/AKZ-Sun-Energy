import React from 'react';

const ActionProvider = ({ createChatBotMessage, setState, children }: any) => {
  const handleUserMessage = async (_message: string) => {
    // Placeholder for AI response
    const botMessage = createChatBotMessage('شكرا لسؤالك. أنا أعمل على معالجة إجابة ذكية. (هذا نموذج تجريبي)', {});

    // For real AI integration:
    // const response = await fetch('https://api.openai.com/v1/chat/completions', {
    //   method: 'POST',
    //   headers: {
    //     'Content-Type': 'application/json',
    //     'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
    //   },
    //   body: JSON.stringify({
    //     model: 'gpt-3.5-turbo',
    //     messages: [
    //       { role: 'system', content: 'أنت مساعد ذكي لتركيب المنظومات الشمسية. أجب بالعربية على أسئلة التحديات التركيبية.' },
    //       { role: 'user', content: message },
    //     ],
    //   }),
    // });
    // const data = await response.json();
    // const botMessage = createChatBotMessage(data.choices[0].message.content, {});

    setState((prev: any) => ({
      ...prev,
      messages: [...prev.messages, botMessage],
    }));
  };

  return (
    <div>
      {React.Children.map(children, (child) => {
        return React.cloneElement(child, {
          actions: {
            handleUserMessage,
          },
        });
      })}
    </div>
  );
};

export default ActionProvider;