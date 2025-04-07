<template>
  <div class="chat-window">
    <!-- 内容区域（可滚动部分） -->
    <div class="scrollable-content" ref="scrollableContentRef">

      <!-- 
        WelcomePanel 容器:
        - 不再使用 v-if 控制渲染，它始终存在
        - 使用 :class 应用布局和显隐样式
      -->
      <div class="welcome-panel-wrapper" :class="{
        'layout-expanded': !isWelcomePanelMinimized && messages.length === 0,
        'layout-minimized': isWelcomePanelMinimized,
        'layout-hidden': !isWelcomePanelMinimized && messages.length > 0
      }">
        <WelcomePanel :has-messages="messages.length > 0" @select-question="handleQuestionSelect"
          @update:minimized="isWelcomePanelMinimized = $event" class="welcome-panel-component" />
      </div>

      <!-- 聊天消息 -->
      <ChatMessages class="chat-messages-area" :class="{ 'with-minimized-panel': isWelcomePanelMinimized }"
        :messages="messages" />

      <!-- 占位符 -->
      <div class="spacer"></div>
    </div>

    <!-- 固定在底部的聊天输入框 -->
    <div class="fixed-bottom">
      <ChatInput class="chat-input-area" @send-message="handleSendMessage" :disabled="isUploading || isLoading" />
      <div class="disclaimer">
        成都金牛高新技术产业园区管委会提醒您。AI也会犯错,请核查重要信息。
      </div>
    </div>

    <!-- 全局音频播放器 -->
    <audio ref="audioPlayer" style="display: none;"></audio>
  </div>
</template>

<script setup lang="ts">
  import { ref, onMounted, nextTick, watch } from 'vue';
  import ChatMessages from '@/components/ChatMessages.vue';
  import ChatInput from '@/components/ChatInput.vue';
  import WelcomePanel from '@/components/WelcomePanel.vue';
  import { sendChatMessageStream, uploadFile } from '@/api';
  // import { getMessages } from '@/api/ChatMessageApi';
  import type { ChunkChatCompletionResponse, ChatMessageRequest, RequestFile, FileUploadResponse } from '@/api';
  import type { Message } from '@/types/ChatMessageType.ts';
  import { ElMessage } from 'element-plus';

  // --- 状态 ---
  const messages = ref<Message[]>([]);
  const isLoading = ref(false);
  const isUploading = ref(false);
  const conversationId = ref<string>('');
  const userId = 'test-user-123';
  const audioPlayer = ref<HTMLAudioElement | null>(null);
  let stopStreamHandler: { abort: () => void } | null = null;
  const scrollableContentRef = ref<HTMLDivElement | null>(null);
  const isWelcomePanelMinimized = ref(false); // 跟踪 WelcomePanel 状态

  // --- 辅助函数, 滚动逻辑, 文件上传, 发送消息, 加载历史 (保持不变) ---
  const generateTempId = (): string => `temp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const findMessageIndexById = (id: string): number => messages.value.findIndex(msg => msg.id === id);
  const scrollToBottom = async (behavior: ScrollBehavior = 'smooth') => {
    await nextTick();
    const scrollContainer = scrollableContentRef.value;
    if (scrollContainer) {
      const threshold = 150;
      const isNearBottom = scrollContainer.scrollHeight - scrollContainer.scrollTop - scrollContainer.clientHeight < threshold;
      if (behavior === 'auto' || isNearBottom) {
        scrollContainer.scrollTo({ top: scrollContainer.scrollHeight, behavior: behavior });
      }
    }
  };
  watch(messages, async (newMessages, oldMessages) => {
    const isNewMessageAdded = newMessages.length > oldMessages.length;
    const lastMessage = newMessages[newMessages.length - 1];
    const oldLastMessage = oldMessages[oldMessages.length - 1];
    const isLastMessageStreaming = !isNewMessageAdded && newMessages.length > 0 &&
      lastMessage?.id === oldLastMessage?.id &&
      lastMessage?.role === 'assistant' &&
      lastMessage?.isProcessing &&
      lastMessage?.content !== oldLastMessage?.content;
    if (isNewMessageAdded || isLastMessageStreaming) {
      await scrollToBottom('smooth');
    }
  }, { deep: true });
  const handleFileUpload = async (files: File[]): Promise<RequestFile[]> => {
    if (files.length === 0) return [];
    isUploading.value = true;
    ElMessage.info('开始上传文件...');
    let apiFiles: RequestFile[] = [];
    try {
      const uploadPromises = files.map(file => uploadFile(file, userId).catch(err => ({ error: true, file, message: err.message || '上传失败' })));
      const results = await Promise.all(uploadPromises);
      const successfulUploads = results.filter((r): r is FileUploadResponse => !('error' in r));
      // const successfulUploads = results.filter(r => !r.error);
      const failedUploads = results.filter((r): r is { error: boolean; file: File; message: any } => 'error' in r);
      // const failedUploads = results.filter(r => r.error);
      if (failedUploads.length > 0) { failedUploads.forEach(fail => { ElMessage.error(`文件 ${fail.file.name} 上传失败: ${fail.message}`); }); }
      if (successfulUploads.length === 0 && failedUploads.length > 0) { throw new Error('所有文件上传失败'); }
      apiFiles = successfulUploads.map((result) => {
        const originalFile = files.find(f => f.name === result.name) || files[successfulUploads.indexOf(result)];
        if (!originalFile) return null;
        let apiType: RequestFile['type'] = 'custom';
        const fileMainType = originalFile.type.split('/')[0];
        if (fileMainType === 'image') apiType = 'image';
        else if (fileMainType === 'audio') apiType = 'audio';
        else if (fileMainType === 'video') apiType = 'video';
        else if (/\.(pdf|txt|md|docx?|xlsx?|pptx?|csv|eml|msg|xml|epub)$/i.test(originalFile.name) || originalFile.type.startsWith('text/') || originalFile.type === 'application/pdf') apiType = 'document';
        return { type: apiType, transfer_method: 'local_file', upload_file_id: result.id };
      }).filter(item => item !== null) as RequestFile[];
      if (apiFiles.length > 0) { ElMessage.success(`${apiFiles.length} 个文件上传成功`); }
    } catch (error: any) { if (error.message !== '所有文件上传失败') { ElMessage.error(`文件上传处理失败: ${error.message || '未知错误'}`); } throw error; }
    finally { isUploading.value = false; }
    return apiFiles;
  };
  const handleSendMessage = async (payload: { query: string; files: File[] }) => {
    const { query, files } = payload;
    if (!query.trim() && files.length === 0) { ElMessage.warning('请输入消息内容或上传文件'); return; }
    if (isLoading.value || isUploading.value) { ElMessage.warning('正在处理上一条消息，请稍候...'); return; }
    let apiFiles: RequestFile[] = [];
    if (files.length > 0) { try { apiFiles = await handleFileUpload(files); if (apiFiles.length === 0 && !query.trim()) { return; } } catch (uploadError) { return; } }
    const userMessageId = generateTempId();
    const userMessage: Message = { id: userMessageId, role: 'user', content: query, created_at: Date.now() / 1000, message_files: files.map(file => ({ id: `local_${file.name}_${Date.now()}`, type: file.type.startsWith('image/') ? 'image' : 'file', url: URL.createObjectURL(file), belongs_to: 'user' })), isProcessing: false };
    messages.value.push(userMessage);
    isLoading.value = true;
    const request: ChatMessageRequest = { query: query, inputs: {}, response_mode: 'streaming', conversation_id: conversationId.value || undefined, user: userId, files: apiFiles };
    const assistantMessageTempId = generateTempId();
    let finalAssistantMessageId = '';
    const assistantMessagePlaceholder: Message = { id: assistantMessageTempId, role: 'assistant', content: '', isProcessing: true, message_files: [], metadata: {}, created_at: Date.now() / 1000, };
    messages.value.push(assistantMessagePlaceholder);
    const processChunk = (chunk: ChunkChatCompletionResponse) => {
      const lookupId = finalAssistantMessageId || assistantMessageTempId;
      const index = findMessageIndexById(lookupId);
      if (index === -1) { console.warn(`消息 [${lookupId}] 未找到，无法处理 chunk:`, chunk); return; }
      if (!conversationId.value && chunk.conversation_id) { conversationId.value = chunk.conversation_id; }
      const chunkMessageId = chunk.message_id || (
        chunk.event !== 'ping' &&
          chunk.event !== 'error' &&
          'id' in chunk ? chunk.id : undefined
      );
      if (!finalAssistantMessageId && chunkMessageId && chunkMessageId !== assistantMessageTempId) { finalAssistantMessageId = chunkMessageId; messages.value[index].id = finalAssistantMessageId; }
      switch (chunk.event) {
        case 'message': messages.value[index].content += chunk.answer; break;
        case 'message_file': if (!messages.value[index].message_files) { messages.value[index].message_files = []; } if (!messages.value[index].message_files!.some(f => f.id === chunk.id)) { messages.value[index].message_files!.push({ id: chunk.id, type: chunk.type, url: chunk.url, belongs_to: 'assistant' }); } break;
        case 'message_end': if (chunk.metadata) { messages.value[index].metadata = { ...messages.value[index].metadata, ...chunk.metadata }; } messages.value[index].isProcessing = false; isLoading.value = false; stopStreamHandler = null; break;
        case 'error': console.error('SSE 流错误:', chunk); messages.value[index].content = `抱歉，处理时遇到问题: ${chunk.message || chunk.code || '未知错误'}`; messages.value[index].metadata = { ...messages.value[index].metadata, error: true }; messages.value[index].isProcessing = false; if (stopStreamHandler) { stopStreamHandler.abort(); } isLoading.value = false; stopStreamHandler = null; ElMessage.error(`请求处理出错: ${chunk.message || chunk.code || '未知错误'}`); break;
        default: break;
      }
    };
    const handleError = (error: any) => {
      console.error('发送消息或处理流时发生错误:', error);
      const lookupId = finalAssistantMessageId || assistantMessageTempId;
      const index = findMessageIndexById(lookupId);
      const errorMessage = `请求失败: ${error?.message || '网络连接错误或服务器无响应'}`;
      if (index !== -1) { messages.value[index].content = errorMessage; messages.value[index].metadata = { ...messages.value[index].metadata, error: true }; messages.value[index].isProcessing = false; } else { messages.value.push({ id: generateTempId(), role: 'assistant', content: errorMessage, isProcessing: false, metadata: { error: true }, created_at: Date.now() / 1000 }); }
      isLoading.value = false; isUploading.value = false; stopStreamHandler = null; ElMessage.error(errorMessage);
    };
    try { stopStreamHandler = await sendChatMessageStream(request, processChunk, handleError); } catch (error) { handleError(error); }
  };
  // const loadHistory = async (convId: string) => {
    // if (!convId) { messages.value = []; conversationId.value = ''; return; }
    // isLoading.value = true; messages.value = []; await nextTick();
    // try {
      // const response = await getMessages(convId, userId, undefined, 50);
      // const historyMessages = response.data.reverse();
      // messages.value = historyMessages.map(msg => ({ id: msg.id, role: msg.query ? 'user' : 'assistant', content: msg.query || msg.answer, message_files: msg.message_files || [], metadata: { retriever_resources: msg.retriever_resources, usage: msg.usage }, created_at: msg.created_at, isProcessing: false }));
      // conversationId.value = convId; ElMessage.success('历史消息加载成功');
      // await scrollToBottom('auto');
    // } catch (error: any) { console.error('加载历史消息失败:', error); ElMessage.error(`加载历史消息失败: ${error.message || '未知错误'}`); messages.value = []; conversationId.value = ''; }
    // finally { isLoading.value = false; }
  // };


  // --- 处理欢迎面板选择问题 ---
  const handleQuestionSelect = (questionText: string) => {
    // WelcomePanel 内部会触发 minimizePanel 并 emit 'update:minimized'
    handleSendMessage({ query: questionText, files: [] });
  };

  // --- 生命周期 ---
  onMounted(() => {
    console.log("ChatWindow: Component mounted.");
    // 可以在此添加加载历史会话的逻辑
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
    padding: 20px 10px 10px;
    padding-bottom: 140px;
    /* 为底部固定元素留出空间 */
    scroll-behavior: smooth;
    display: flex;
    flex-direction: column;
    position: relative;
    /* 用于绝对定位子元素 */
  }

  /* WelcomePanel 容器样式 */
  .welcome-panel-wrapper {
    width: 100%;
    max-width: 800px;
    margin-left: auto;
    margin-right: auto;
    flex-shrink: 0;
    box-sizing: border-box;
    position: relative;
    /* 默认相对定位 */
    z-index: 5;
    /* 添加过渡效果，包括高度和透明度 */
    transition: margin-bottom 0.4s ease, max-height 0.4s ease, opacity 0.3s ease;
    overflow: hidden;
    /* 隐藏超出内容 */
  }

  /* 展开状态 (默认) */
  .welcome-panel-wrapper.layout-expanded {
    margin-bottom: 20px;
    max-height: 80vh;
    /* 允许足够的高度 */
    opacity: 1;
    pointer-events: auto;
  }

  /* 最小化状态 - 绝对定位到左下角 */
  .welcome-panel-wrapper.layout-minimized {
    position: absolute;
    bottom: 10px;
    /* 距离滚动区域底部 */
    left: 15px;
    /* 距离滚动区域左侧 */
    width: auto;
    /* 宽度由子组件控制 */
    max-width: none;
    margin-bottom: 0;
    z-index: 15;
    max-height: 100px;
    /* 限制最大高度，防止意外撑开 */
    opacity: 1;
    /* 确保可见 */
    pointer-events: auto;
    /* 允许交互 */
    overflow: visible;
    /* 允许子组件的 box-shadow 等显示 */
  }

  /* 隐藏状态 (当有消息但未最小化时) */
  .welcome-panel-wrapper.layout-hidden {
    max-height: 0;
    /* 收起高度 */
    opacity: 0;
    margin-bottom: 0;
    pointer-events: none;
    /* 禁止交互 */
    /* z-index 不重要，因为它不可见 */
  }


  /* WelcomePanel 组件本身的样式 */
  .welcome-panel-component {
    display: block;
    /* 确保子组件的过渡效果能正常播放 */
    /* 无需特殊样式，依赖子组件内部 */
  }

  /* 聊天消息区域样式 */
  .chat-messages-area {
    width: 100%;
    max-width: 800px;
    margin-left: auto;
    margin-right: auto;
    padding: 0 5px;
    box-sizing: border-box;
    flex-grow: 1;
    transition: padding-bottom 0.3s ease;
  }

  /* 当最小化面板激活时，增加消息区域底部内边距 */
  .chat-messages-area.with-minimized-panel {
    padding-bottom: 60px;
    /* 增加底部空间，大于最小化面板高度+间距 */
  }


  /* 占位符 */
  .spacer {
    height: 10px;
    flex-shrink: 0;
  }

  /* 固定底部区域 */
  .fixed-bottom {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    background-color: rgba(255, 255, 255, 0.95);
    backdrop-filter: blur(5px);
    box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.06);
    padding: 10px;
    z-index: 100;
    display: flex;
    flex-direction: column;
    align-items: center;
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
    padding-top: 6px;
    padding-bottom: 4px;
    width: 100%;
    max-width: 800px;
    box-sizing: border-box;
  }

  /* --- 滚动条样式 --- */
  .scrollable-content::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }

  .scrollable-content::-webkit-scrollbar-track {
    background: transparent;
  }

  .scrollable-content::-webkit-scrollbar-thumb {
    background: #d1d5db;
    border-radius: 3px;
  }

  .scrollable-content::-webkit-scrollbar-thumb:hover {
    background: #adb5bd;
  }

  .scrollable-content {
    scrollbar-width: thin;
    scrollbar-color: #d1d5db transparent;
  }

</style>