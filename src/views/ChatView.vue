<!-- src/views/ChatWindow.vue -->
<template>
  <div class="chat-window">
    <!-- 内容区域（可滚动部分） -->
    <div class="scrollable-content">
      <!-- 开场白面板 -->
      <WelcomePanel 
        :has-messages="messages.length > 0" 
        @select-question="handleQuestionSelect" 
        class="welcome-panel-container" />
      
      <!-- 聊天消息 -->
      <ChatMessages class="chat-messages-area" :messages="messages" />
      
      <!-- 占位符，确保内容区域高度足够可以滚动 -->
      <div class="spacer"></div>
    </div>
    
    <!-- 固定在底部的聊天输入框 -->
    <div class="fixed-bottom">
      <ChatInput class="chat-input-area" @send-message="handleSendMessage" :disabled="isUploading || isLoading" />
      
      <!-- 免责声明 -->
      <div class="disclaimer">
        成都金牛高新技术产业园区管委会提醒您。AI也会犯错,请核查重要信息。
      </div>
    </div>
    
    <!-- 全局音频播放器 -->
    <audio ref="audioPlayer" style="display: none;"></audio>
  </div>
</template>

<script setup lang="ts">
  import { ref, onMounted } from 'vue';
  import ChatMessages from '@/components/ChatMessages.vue';
  import ChatInput from '@/components/ChatInput.vue';
  import WelcomePanel from '@/components/WelcomePanel.vue'; // 导入新组件
  import {
    sendChatMessageStream,
    uploadFile,
    getMessages,
  } from '@/api';
  import type {
    ChunkChatCompletionResponse,
    ChatMessageRequest,
    RequestFile,
  } from '@/api';
  import type { Message } from '@/types/ChatMessageType.ts';

  import { ElMessage } from 'element-plus';

  // --- 原有的状态和方法保持不变 ---
  const messages = ref<Message[]>([]);
  const isLoading = ref(false);
  const isUploading = ref(false);
  const conversationId = ref<string>('');
  const userId = 'abc-123';
  const audioPlayer = ref<HTMLAudioElement | null>(null);
  let stopStreamHandler: { abort: () => void } | null = null;

  // --- 辅助函数 ---
  const generateTempId = (): string => `temp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const findMessageIndexById = (id: string): number => messages.value.findIndex(msg => msg.id === id);

  // --- 处理用户从欢迎面板选择问题 ---
  const handleQuestionSelect = (questionText: string) => {
    // 直接调用已有的发送消息处理函数，传入选定的问题文本
    handleSendMessage({
      query: questionText,
      files: []
    });
  };

  // --- 其余代码保持不变 ---
  const handleFileUpload = async (files: File[]): Promise<RequestFile[]> => {
    if (files.length === 0) return [];

    isUploading.value = true;
    let apiFiles: RequestFile[] = [];
    try {
      const uploadPromises = files.map(file => uploadFile(file, userId)); // 并行上传
      const uploadResults = await Promise.all(uploadPromises);

      apiFiles = uploadResults.map((result, index) => {
        const file = files[index];
        let apiType: RequestFile['type'] = 'custom';
        const fileMainType = file.type.split('/')[0];
        if (fileMainType === 'image') apiType = 'image';
        else if (fileMainType === 'audio') apiType = 'audio';
        else if (fileMainType === 'video') apiType = 'video';
        else if (/\.(pdf|txt|md|docx?|xlsx?|pptx?|csv|eml|msg|xml|epub)$/i.test(file.name) || file.type.startsWith('text/') || file.type === 'application/pdf') {
          apiType = 'document';
        }
        return { type: apiType, transfer_method: 'local_file', upload_file_id: result.id };
      });
    } catch (error: any) {
      console.error('文件上传失败:', error);
      ElMessage.error(`文件上传失败: ${error.message || '未知错误'}`);
      throw error;
    } finally {
      isUploading.value = false;
    }
    return apiFiles;
  };

  const handleSendMessage = async (payload: { query: string; files: File[] }) => {
    const { query, files } = payload;

    if (isLoading.value || isUploading.value) return;

    let apiFiles: RequestFile[] = [];
    try {
      apiFiles = await handleFileUpload(files);
    } catch (uploadError) {
      return;
    }

    const userMessageId = generateTempId();
    const userMessage: Message = {
      id: userMessageId,
      role: 'user',
      content: query,
      created_at: Date.now() / 1000,
      message_files: files.map(file => ({
        id: `local_${file.name}_${Date.now()}`,
        type: file.type.startsWith('image/') ? 'image' : 'file',
        url: URL.createObjectURL(file),
        belongs_to: 'user'
      })),
      isProcessing: false
    };
    messages.value.push(userMessage);

    isLoading.value = true;
    const request: ChatMessageRequest = {
      query: query,
      inputs: {},
      response_mode: 'streaming',
      conversation_id: conversationId.value || undefined,
      user: userId,
      files: apiFiles
    };

    const assistantMessageTempId = generateTempId();
    let finalAssistantMessageId = '';
    const assistantMessagePlaceholder: Message = {
      id: assistantMessageTempId,
      role: 'assistant',
      content: '',
      isProcessing: true,
      message_files: [],
      metadata: {},
      created_at: Date.now() / 1000,
    };
    messages.value.push(assistantMessagePlaceholder);

    const processChunk = (chunk: ChunkChatCompletionResponse) => {
      const lookupId = finalAssistantMessageId || assistantMessageTempId;
      const index = findMessageIndexById(lookupId);

      if (index === -1) {
        console.warn(`找不到 ID 为 ${lookupId} 的消息来处理 chunk:`, chunk);
        return;
      }

      if (!conversationId.value && chunk.conversation_id) {
        conversationId.value = chunk.conversation_id;
      }

      const chunkMessageId = chunk.message_id || (chunk.event !== 'ping' && chunk.event !== 'error' ? chunk.id : undefined);
      if (!finalAssistantMessageId && chunkMessageId && chunkMessageId !== assistantMessageTempId) {
        finalAssistantMessageId = chunkMessageId;
        messages.value[index].id = finalAssistantMessageId;
      }

      switch (chunk.event) {
        case 'message':
          messages.value[index].content += chunk.answer;
          break;

        case 'message_replace':
          break;

        case 'message_file':
          if (!messages.value[index].message_files) {
            messages.value[index].message_files = [];
          }
          if (!messages.value[index].message_files?.some(f => f.id === chunk.id)) {
            messages.value[index].message_files!.push({
              id: chunk.id,
              type: chunk.type,
              url: chunk.url,
              belongs_to: 'assistant'
            });
          }
          break;

        case 'message_end':
          if (chunk.metadata) {
            messages.value[index].metadata = {
              ...messages.value[index].metadata,
              ...chunk.metadata
            };
          }
          messages.value[index].isProcessing = false;
          isLoading.value = false;
          stopStreamHandler = null;
          console.log('消息流结束:', finalAssistantMessageId || assistantMessageTempId);
          break;

        case 'workflow_started':
        case 'workflow_finished':
        case 'node_started':
        case 'node_finished':
          break;

        case 'ping':
          break;

        case 'error':
          console.error('SSE 流错误:', chunk);
          messages.value[index].content = `发生错误: ${chunk.message || chunk.code || '未知流错误'}`;
          messages.value[index].metadata = { ...messages.value[index].metadata, error: true };
          messages.value[index].isProcessing = false;
          if (stopStreamHandler) {
            stopStreamHandler.abort();
          }
          isLoading.value = false;
          stopStreamHandler = null;
          ElMessage.error(`请求处理出错: ${chunk.message || chunk.code || '未知错误'}`);
          break;

        default:
          console.warn('未处理的 SSE 事件:', chunk);
      }
    };

    const handleError = (error: any) => {
      console.error('发送消息或处理流时出错:', error);

      const lookupId = finalAssistantMessageId || assistantMessageTempId;
      const index = findMessageIndexById(lookupId);
      const errorMessage = `请求失败: ${error.message || '网络错误或未知问题'}`;

      if (index !== -1) {
        messages.value[index].content = errorMessage;
        messages.value[index].metadata = { ...messages.value[index].metadata, error: true };
        messages.value[index].isProcessing = false;
      } else {
        messages.value.push({
          id: generateTempId(),
          role: 'assistant',
          content: errorMessage,
          isProcessing: false,
          metadata: { error: true },
          created_at: Date.now() / 1000,
        });
      }

      isLoading.value = false;
      isUploading.value = false;
      stopStreamHandler = null;
      ElMessage.error(errorMessage);
    };

    try {
      stopStreamHandler = await sendChatMessageStream(request, processChunk, handleError);
    } catch (error) {
      handleError(error);
    }
  };

  const loadHistory = async (convId: string) => {
    if (!convId) {
      console.warn("尝试加载历史记录，但未提供 conversationId");
      return;
    }
    isLoading.value = true;
    try {
      const response = await getMessages(convId, userId, undefined, 20);
      const historyMessages = response.data.reverse();

      messages.value = historyMessages.map(msg => ({
        id: msg.id,
        role: msg.query ? 'user' : 'assistant',
        content: msg.query || msg.answer,
        message_files: msg.message_files || [],
        metadata: {
           retriever_resources: msg.retriever_resources,
           usage: msg.usage
         },
        created_at: msg.created_at,
        isProcessing: false,
      }));
      conversationId.value = convId;
      ElMessage.success('历史消息加载成功');
    } catch (error: any) {
      console.error('加载历史消息失败:', error);
      ElMessage.error(`加载历史消息失败: ${error.message || '未知错误'}`);
      messages.value = [];
      conversationId.value = '';
    } finally {
      isLoading.value = false;
    }
  };

  onMounted(() => {
    console.log("ChatWindow: Component mounted.");
  });

</script>

<style scoped>
.chat-window {
  display: flex;
  flex-direction: column;
  height: 100vh;
  max-height: 100vh;
  overflow: hidden;
  background-color: #ffffff;
  position: relative;
}

.scrollable-content {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 0 10px;
  display: flex;
  flex-direction: column;
  padding-bottom: 120px; /* 为固定底部留出空间 */
  scroll-behavior: smooth;
}

.welcome-panel-container {
  width: 100%;
  max-width: 800px;
  margin-left: auto;
  margin-right: auto;
  padding-top: 20px;
  flex-shrink: 0;
  box-sizing: border-box;
}

.chat-messages-area {
  width: 100%;
  max-width: 800px;
  margin-left: auto;
  margin-right: auto;
  padding: 20px 5px 10px;
  box-sizing: border-box;
}

.spacer {
  height: 20px; /* 底部额外间距 */
}

.fixed-bottom {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background-color: #ffffff;
  /* box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.05); */
  padding: 10px;
  z-index: 100;
}

.chat-input-area {
  width: 100%;
  max-width: 800px;
  margin-left: auto;
  margin-right: auto;
  box-sizing: border-box;
}

.disclaimer {
  text-align: center;
  font-size: 12px;
  color: #a0aec0;
  padding-top: 3px;
  padding-bottom: 5px;
  width: 100%;
  max-width: 800px;
  margin-left: auto;
  margin-right: auto;
  box-sizing: border-box;
}

/* 滚动条样式应用在全局 .scrollable-content 上 */
.scrollable-content::-webkit-scrollbar {
  width: 6px;
}

.scrollable-content::-webkit-scrollbar-track {
  background: #f1f1f1;
  border-radius: 3px;
}

.scrollable-content::-webkit-scrollbar-thumb {
  background: #cccccc;
  border-radius: 3px;
}

.scrollable-content::-webkit-scrollbar-thumb:hover {
  background: #aaaaaa;
}

.scrollable-content {
  scrollbar-width: thin;
  scrollbar-color: #cccccc #f1f1f1;
}
</style>