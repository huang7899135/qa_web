<!-- src/views/ChatWindow.vue -->
<template>
  <div class="chat-window">
    <ChatMessages class="chat-messages-area" :messages="messages" />
    <ChatInput class="chat-input-area" @send-message="handleSendMessage" :disabled="isUploading || isLoading" />
    <!-- 添加免责声明 -->
    <div class="disclaimer">
      成都金牛高新技术产业园区管委会提醒您。AI也会犯错,请核查重要信息。
    </div>
    <!-- 全局的隐藏音频播放器元素 -->
    <audio ref="audioPlayer" style="display: none;"></audio>
  </div>
</template>

<script setup lang="ts">
  import { ref, onMounted } from 'vue';
  import ChatMessages from '@/components/ChatMessages.vue';
  import ChatInput from '@/components/ChatInput.vue';
  import {
    sendChatMessageStream,
    uploadFile,
    getMessages,
  } from '@/api/index';
  import type {
    ChunkChatCompletionResponse,
    ChatMessageRequest,
    RequestFile,
    RetrieverResource,
    Usage,
  } from '@/api/index';

  // --- 消息接口定义 ---
  interface MessageFile { id: string; type: string; url: string; belongs_to: 'user' | 'assistant'; }

  interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    message_files?: MessageFile[];
    metadata?: {
      retriever_resources?: RetrieverResource[];
      error?: boolean;
      usage?: Usage;
      [key: string]: any;
    };
    created_at?: number;
    isProcessing?: boolean;
  }

  const messages = ref<Message[]>([]);
  const isLoading = ref(false);
  const isUploading = ref(false);
  const conversationId = ref('');
  const userId = 'abc-123';
  const audioPlayer = ref<HTMLAudioElement | null>(null); // 保持 TTS 播放器引用，以防将来需要
  let stopStreamHandler: { abort: () => void } | null = null;

  // --- Helper Functions (保持不变) ---
  const generateTempId = (): string => `temp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const findMessageIndexById = (id: string): number => messages.value.findIndex(msg => msg.id === id);

  // --- API Interaction ---

  const handleSendMessage = async (payload: { query: string; files: File[] }) => {
    const { query, files } = payload;
    let apiFiles: RequestFile[] = [];
    if (files.length > 0) {
      isUploading.value = true;
      // ... 上传逻辑 ...
      try {
        const uploadPromises = files.map(file => uploadFile(file, userId));
        const uploadResults = await Promise.all(uploadPromises);
        apiFiles = uploadResults.map((result, index) => {
          const file = files[index];
          const fileType = file.type.split('/')[0];
          let apiType: RequestFile['type'] = 'custom';
          if (['image'].includes(fileType)) apiType = 'image';
          else if (['audio'].includes(fileType)) apiType = 'audio';
          else if (['video'].includes(fileType)) apiType = 'video';
          else if (['application/pdf', 'text/plain'].includes(file.type) || /\.(pdf|txt|md|docx?|xlsx?|pptx?|csv|eml|msg|xml|epub)$/i.test(file.name)) {
            apiType = 'document';
          }
          return { type: apiType, transfer_method: 'local_file', upload_file_id: result.id };
        });
      } catch (error: any) { /* ... error handling ... */ isUploading.value = false; return; }
      finally { isUploading.value = false; }
    }

    // ... 添加用户消息 ...
    const userMessageId = generateTempId();
    const userMessage: Message = { id: userMessageId, role: 'user', content: query, created_at: Date.now() / 1000 };
    messages.value.push(userMessage);

    // ... 准备请求和初始化助手消息 ...
    isLoading.value = true;
    const request: ChatMessageRequest = { query, inputs: {}, response_mode: 'streaming', conversation_id: conversationId.value || undefined, user: userId, files: apiFiles };
    const assistantMessageId = generateTempId();
    let currentAssistantContent = '';
    let finalAssistantMessageId = '';
    const assistantMessage: Message = { id: assistantMessageId, role: 'assistant', content: '', isProcessing: true, message_files: [], metadata: {} };
    messages.value.push(assistantMessage);

    // ... processChunk 和 handleError 逻辑 ...
    const processChunk = (chunk: ChunkChatCompletionResponse) => {
      const lookupId = finalAssistantMessageId || assistantMessageId;
      const index = findMessageIndexById(lookupId);
      if (index === -1) { /* ... */ return; }
      if (!conversationId.value && chunk.conversation_id) { conversationId.value = chunk.conversation_id; }
      const chunkMessageId = chunk.message_id || (chunk.event !== 'ping' && chunk.event !== 'error' ? chunk.id : undefined);
      if (!finalAssistantMessageId && chunkMessageId && chunkMessageId !== assistantMessageId) {
        finalAssistantMessageId = chunkMessageId;
        messages.value[index].id = finalAssistantMessageId;
      }
      switch (chunk.event) {
        case 'message': currentAssistantContent += chunk.answer; messages.value[index].content = currentAssistantContent; break;
        case 'message_replace': currentAssistantContent = chunk.answer; messages.value[index].content = currentAssistantContent; break;
        case 'message_file':
          if (!messages.value[index].message_files) messages.value[index].message_files = [];
          if (!messages.value[index].message_files?.some(f => f.id === chunk.id)) {
            messages.value[index].message_files!.push({ id: chunk.id, type: chunk.type, url: chunk.url, belongs_to: chunk.belongs_to });
          }
          break;
        case 'message_end':
          if (chunk.metadata) { messages.value[index].metadata = { /* ... */ }; }
          messages.value[index].isProcessing = false;
          isLoading.value = false;
          stopStreamHandler = null;
          break;
        case 'error':
          messages.value[index].content = `发生错误: ${chunk.message || '未知流错误'}`;
          messages.value[index].metadata = { ...messages.value[index].metadata, error: true };
          messages.value[index].isProcessing = false;
          if (stopStreamHandler) stopStreamHandler.abort();
          isLoading.value = false;
          stopStreamHandler = null;
          break;
        // ... 其他 case ...
      }
    };
    const handleError = (error: any) => {
      const lookupId = finalAssistantMessageId || assistantMessageId;
      const index = findMessageIndexById(lookupId);
      if (index !== -1) { /* ... update message ... */ }
      else { /* ... add error message ... */ }
      isLoading.value = false; isUploading.value = false; stopStreamHandler = null;
    };

    // ... (启动流式请求逻辑保持不变) ...
    try {
      stopStreamHandler = (await sendChatMessageStream(request, processChunk, handleError));
    } catch (error) { handleError(error); }
  };

  const loadHistory = async (convId: string) => {
    if (!convId) return;
    try {
      const response = await getMessages(convId, userId, undefined, 20);
      const historyMessages = response.data.reverse();
      messages.value = historyMessages.map(msg => ({
        id: msg.id,
        role: msg.query ? 'user' : 'assistant',
        content: msg.query || msg.answer,
        message_files: msg.message_files,
        // feedback: msg.feedback, // 移除
        metadata: { retriever_resources: msg.retriever_resources },
        created_at: msg.created_at,
        isProcessing: false,
      }));
      conversationId.value = convId;
    } catch (error: any) { /* ... */ }
  };

  // --- Lifecycle Hooks (保持不变) ---
  onMounted(() => { console.log("ChatWindow: Component mounted."); });

</script>


<style scoped>
  .chat-window {
    display: flex;
    flex-direction: column;
    height: 100vh;
    max-height: 100vh;
    /* Ensure it doesn't exceed viewport height */
    overflow: hidden;
    /* Prevent the whole window from scrolling */
    background-color: #ffffff;
    /* Keep horizontal padding on the main container */
    padding: 0 10px;
    box-sizing: border-box;
  }

  /* Define a consistent max-width for content areas */
  .content-limiter {
    width: 100%;
    /* Take available horizontal space */
    max-width: 800px;
    /* Set your desired max width */
    margin-left: auto;
    /* Center the content horizontally */
    margin-right: auto;
    /* Center the content horizontally */
    box-sizing: border-box;
    /* Include padding/border in element's total width/height */
  }


  /* Apply the limiter to the messages area */
  .chat-messages-area {
    flex-grow: 1;
    /* Take available vertical space */
    overflow-y: auto;
    /* Allow vertical scrolling ONLY for messages */
    padding-top: 20px;
    /* Space at the top */
    padding-bottom: 10px;
    /* Space between messages and input */
    width: 100%;
    max-width: 800px;
    margin-left: auto;
    margin-right: auto;
    padding-left: 5px;
    /* Adjust internal padding as needed */
    padding-right: 5px;
    /* Adjust internal padding as needed */
    box-sizing: border-box;
  }

  .chat-input-area {
    flex-shrink: 0;
    padding-top: 10px;
    /* Add some space above the input box */
    padding-bottom: 10px;
    /* Space below input, above disclaimer */
    /* Inherit width/max-width/centering from .content-limiter */
    width: 100%;
    max-width: 800px;
    margin-left: auto;
    margin-right: auto;
    box-sizing: border-box;
    /* Remove the old margin setting */
    /* margin: 0 auto 10px auto; */
    /* REMOVE this */
  }

  /* Apply the limiter to the disclaimer */
  .disclaimer {
    margin-top: 3px;
    flex-shrink: 0;
    /* Prevent disclaimer from shrinking */
    text-align: center;
    font-size: 12px;
    color: #a0aec0;
    padding-bottom: 10px;
    /* Space at the very bottom */
    /* Inherit width/max-width/centering from .content-limiter */
    width: 100%;
    max-width: 800px;
    margin-left: auto;
    margin-right: auto;
    box-sizing: border-box;
  }

  /* Hide scrollbar for the main window if it ever appears (it shouldn't) */
  .chat-window::-webkit-scrollbar {
    display: none;
  }

  .chat-window {
    -ms-overflow-style: none;
    /* IE and Edge */
    scrollbar-width: none;
    /* Firefox */
  }

  /* Style scrollbar for the messages area (optional but recommended) */
  .chat-messages-area::-webkit-scrollbar {
    width: 6px;
  }

  .chat-messages-area::-webkit-scrollbar-track {
    background: #f1f1f1;
    border-radius: 3px;
  }

  .chat-messages-area::-webkit-scrollbar-thumb {
    background: #cccccc;
    border-radius: 3px;
  }

  .chat-messages-area::-webkit-scrollbar-thumb:hover {
    background: #aaaaaa;
  }

  .chat-messages-area {
    scrollbar-width: thin;
    /* Firefox */
    scrollbar-color: #cccccc #f1f1f1;
    /* Firefox */
  }


</style>