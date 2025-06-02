<template>
  <div class="chat-window">
    <!-- 固定在顶部的 WelcomePanel -->
    <div class="fixed-top">
      <WelcomePanel :has-messages="messages.length > 0" @select-question="handleQuestionSelect"
        class="welcome-panel-component" />
    </div>

    <!-- 内容区域（可滚动部分） -->
    <div class="scrollable-content" ref="scrollableContentRef">
      <!-- 聊天消息 -->
      <ChatMessages class="chat-messages-area" :messages="messages" />
    </div>

    <!-- 固定在底部的聊天输入框 -->
    <div class="fixed-bottom">
      <ChatInput 
        class="chat-input-area" 
        @send-message="handleSendMessage" 
        @stop-message="handleStopMessage"
        :disabled="isUploading || isLoading" 
        :is-loading="isLoading"
      />
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

  import type { ChunkChatCompletionResponse, ChatMessageRequest, RequestFile, FileUploadResponse } from '@/api/types';
  import type { Message } from '@/types/ChatMessageType.ts'; 
  import { ElMessage } from 'element-plus';

  // --- 状态 ---
  const messages = ref<Message[]>([]); // 聊天消息列表
  const isLoading = ref(false); // 是否正在等待 AI 响应
  const isUploading = ref(false); // 是否正在上传文件
  const conversationId = ref<string>(''); // 当前会话 ID
  const userId = 'test-user-123'; // 示例用户 ID，实际应用中应动态获取
  const audioPlayer = ref<HTMLAudioElement | null>(null); // 音频播放器引用
  let stopStreamHandler: { abort: () => void } | null = null; // 用于停止 SSE 流的控制器
  const scrollableContentRef = ref<HTMLDivElement | null>(null); // 滚动区域的 DOM 引用
  // 移除了 isWelcomePanelMinimized 状态

  // --- 辅助函数 ---
  const generateTempId = (): string => `temp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const findMessageIndexById = (id: string): number => messages.value.findIndex(msg => msg.id === id);

  // --- 滚动逻辑 ---
  const scrollToBottom = async (behavior: ScrollBehavior = 'smooth') => {
    await nextTick(); // 等待 DOM 更新完成
    const scrollContainer = scrollableContentRef.value;
    if (scrollContainer) {
      const threshold = 150; // 滚动阈值，距离底部小于此值时，新消息才自动滚动
      const isNearBottom = scrollContainer.scrollHeight - scrollContainer.scrollTop - scrollContainer.clientHeight < threshold;
      // 如果是平滑滚动（通常是新消息触发）或者已接近底部，则滚动到底部
      if (behavior === 'smooth' || isNearBottom) {
        scrollContainer.scrollTo({ top: scrollContainer.scrollHeight, behavior: behavior });
      }
    }
  };

  // 监听消息列表变化，自动滚动到底部
  watch(messages, async (newMessages, oldMessages) => {
    const isNewMessageAdded = newMessages.length > oldMessages.length;
    const lastMessage = newMessages[newMessages.length - 1];
    const oldLastMessage = oldMessages[oldMessages.length - 1];

    // 判断是否是最后一条消息在流式更新内容
    const isLastMessageStreaming = !isNewMessageAdded && newMessages.length > 0 &&
      lastMessage?.id === oldLastMessage?.id &&
      lastMessage?.role === 'assistant' &&
      lastMessage?.isProcessing &&
      lastMessage?.content !== oldLastMessage?.content;

    // 只有在新消息添加或最后一条消息正在流式输出时才自动平滑滚动到底部
    if (isNewMessageAdded || isLastMessageStreaming) {
      await scrollToBottom('smooth');
    }
  }, { deep: true }); // 使用 deep watch 监听消息内部变化 (如 content 更新)

  // --- 文件上传 ---
  // (handleFileUpload 函数保持不变，这里省略以减少篇幅，请确保它存在且逻辑正确)
  const handleFileUpload = async (files: File[]): Promise<RequestFile[]> => {
    if (files.length === 0) return [];
    isUploading.value = true;
    ElMessage.info('开始上传文件...');
    let apiFiles: RequestFile[] = [];
    try {
      const uploadPromises = files.map(file =>
        uploadFile(file, userId).catch(err => ({ error: true, file, message: err.message || '上传失败' }))
      );
      const results = await Promise.all(uploadPromises);

      const successfulUploads = results.filter((r): r is FileUploadResponse => !('error' in r));
      const failedUploads = results.filter((r): r is { error: boolean; file: File; message: any } => 'error' in r);

      if (failedUploads.length > 0) {
        failedUploads.forEach(fail => {
          ElMessage.error(`文件 ${fail.file.name} 上传失败: ${fail.message}`);
        });
      }

      if (successfulUploads.length === 0 && failedUploads.length > 0) {
        throw new Error('所有文件上传失败');
      }

      apiFiles = successfulUploads.map((result) => {
        const originalFile = files.find(f => f.name === result.name) || files[successfulUploads.indexOf(result)];
        if (!originalFile) return null;

        let apiType: RequestFile['type'] = 'custom';
        const fileMainType = originalFile.type.split('/')[0];

        if (fileMainType === 'image') apiType = 'image';
        else if (fileMainType === 'audio') apiType = 'audio';
        else if (fileMainType === 'video') apiType = 'video';
        else if (
          originalFile.type.startsWith('text/') ||
          originalFile.type === 'application/pdf' ||
          /\.(pdf|txt|md|docx?|xlsx?|pptx?|csv|eml|msg|xml|epub)$/i.test(originalFile.name)
        ) {
          apiType = 'document';
        }

        return {
          type: apiType,
          transfer_method: 'local_file',
          upload_file_id: result.id,
        };
      }).filter(item => item !== null) as RequestFile[];

      if (apiFiles.length > 0) {
        ElMessage.success(`${apiFiles.length} 个文件上传成功`);
      }

    } catch (error: any) {
      if (error.message !== '所有文件上传失败') {
        ElMessage.error(`文件上传处理失败: ${error.message || '未知错误'}`);
      }
      throw error;
    } finally {
      isUploading.value = false;
    }
    return apiFiles;
  };


  // --- 发送消息 ---
  // **重新加入 handleSendMessage 函数定义**
  const handleSendMessage = async (payload: { query: string; files: File[] }) => {
    const { query, files } = payload;

    // 基础校验
    if (!query.trim() && files.length === 0) {
      ElMessage.warning('请输入消息内容或上传文件');
      return;
    }
    if (isLoading.value || isUploading.value) {
      ElMessage.warning('正在处理上一条消息或上传文件，请稍候...');
      return;
    }

    let apiFiles: RequestFile[] = [];
    // 处理文件上传
    if (files.length > 0) {
      try {
        apiFiles = await handleFileUpload(files);
        if (apiFiles.length === 0 && !query.trim()) {
          return; // 文件上传失败且无文本，则不发送
        }
      } catch (uploadError) {
        return; // 上传出错，中断发送
      }
    }

    // 创建用户消息
    const userMessageId = generateTempId();
    const userMessage: Message = {
      id: userMessageId,
      role: 'user',
      content: query,
      created_at: Date.now() / 1000,
      message_files: files.map(file => ({
        id: `local_${file.name}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        type: file.type.startsWith('image/') ? 'image' : 'file',
        url: URL.createObjectURL(file), // 本地预览 URL
        belongs_to: 'user'
      })),
      isProcessing: false
    };
    messages.value.push(userMessage);

    // 滚动到底部 (使用 'auto' 让浏览器决定是否平滑)
    await scrollToBottom('auto');

    // 设置加载状态
    isLoading.value = true;

    // 构造 API 请求
    const request: ChatMessageRequest = {
      query: query,
      inputs: {},
      response_mode: 'streaming',
      conversation_id: conversationId.value || undefined,
      user: userId,
      files: apiFiles
    };

    // 创建助手消息占位符
    const assistantMessageTempId = generateTempId();
    let finalAssistantMessageId = ''; // 用于存储真实的助手消息 ID
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

    // --- 处理 SSE 流 ---
    const processChunk = (chunk: ChunkChatCompletionResponse) => {
      const lookupId = finalAssistantMessageId || assistantMessageTempId;
      const index = findMessageIndexById(lookupId);

      if (index === -1) {
        console.warn(`SSE: 消息 [${lookupId}] 未找到，无法处理 chunk:`, chunk);
        return;
      }

      if (!conversationId.value && chunk.conversation_id) {
        conversationId.value = chunk.conversation_id;
      }

      const chunkMessageId = chunk.message_id || ('id' in chunk && (chunk.event === 'message' || chunk.event === 'message_file') ? chunk.id : undefined);
      if (!finalAssistantMessageId && chunkMessageId && chunkMessageId !== assistantMessageTempId) {
        finalAssistantMessageId = chunkMessageId;
        messages.value[index].id = finalAssistantMessageId;
      }

      switch (chunk.event) {
        case 'message':
          messages.value[index].content += chunk.answer;
          break;
        case 'message_file':
          if (!messages.value[index].message_files) {
            messages.value[index].message_files = [];
          }
          if (!messages.value[index].message_files!.some(f => f.id === chunk.id)) {
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
            messages.value[index].metadata = { ...messages.value[index].metadata, ...chunk.metadata };
          }
          messages.value[index].isProcessing = false;
          isLoading.value = false;
          stopStreamHandler = null;
          break;
        case 'error':
          console.error('SSE 流错误:', chunk);
          messages.value[index].content = `抱歉，处理时遇到问题: ${chunk.message || chunk.code || '未知错误'}`;
          messages.value[index].metadata = { ...messages.value[index].metadata, error: true };
          messages.value[index].isProcessing = false;
          if (stopStreamHandler) { stopStreamHandler.abort(); }
          isLoading.value = false;
          stopStreamHandler = null;
          ElMessage.error(`请求处理出错: ${chunk.message || chunk.code || '未知错误'}`);
          break;
        case 'ping':
          break; // 忽略 ping
        default:
          break; // 忽略未知事件
      }
    };

    // --- 处理 SSE 错误 ---
    const handleError = (error: any) => {
      console.error('发送消息或处理流时发生错误:', error);
      const lookupId = finalAssistantMessageId || assistantMessageTempId;
      const index = findMessageIndexById(lookupId);
      const errorMessage = `请求失败: ${error?.message || '网络连接错误或服务器无响应'}`;

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
          created_at: Date.now() / 1000
        });
      }
      isLoading.value = false;
      isUploading.value = false;
      stopStreamHandler = null;
      ElMessage.error(errorMessage);
    };

    // --- 发起请求 ---
    try {
      // 调用 API 发送消息，传入请求体、处理函数和错误处理函数
      stopStreamHandler = await sendChatMessageStream(request, processChunk, handleError);
    } catch (error) {
      handleError(error); // 处理同步错误
    }
  };


  // --- 处理欢迎面板选择问题 ---
  const handleQuestionSelect = (questionText: string) => {
    // WelcomePanel 内部会在选择后自动收起，这里只需调用 handleSendMessage
    handleSendMessage({ query: questionText, files: [] });
  };

  // --- 停止消息处理 ---
  const handleStopMessage = () => {
    console.log('停止消息请求');
    if (stopStreamHandler) {
      stopStreamHandler.abort();
      stopStreamHandler = null;
    }
    isLoading.value = false;
    isUploading.value = false;
    
    // 更新最后一条消息的状态
    if (messages.value.length > 0) {
      const lastMessage = messages.value[messages.value.length - 1];
      if (lastMessage.role === 'assistant' && lastMessage.isProcessing) {
        lastMessage.isProcessing = false;
        lastMessage.content += '\n\n[消息已停止]';
        lastMessage.metadata = { ...lastMessage.metadata, stopped: true };
      }
    }
    
    ElMessage.info('已停止消息生成');
  };

  // --- 生命周期 ---
  onMounted(() => {
    console.log("ChatWindow: Component mounted.");
    // 可以在这里加载历史消息等初始化操作
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
    padding: 10px 10px;
    /* 增加底部内边距，确保最后一条消息不被遮挡 */
    /* 可以根据实际 ChatInput 高度微调 */
    padding-bottom: 140px;
    /* <<--- 调整这个值 */
    scroll-behavior: smooth;
    display: flex;
    flex-direction: column;
    position: relative;
  }

  /* 固定顶部区域 */
  .fixed-top {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    z-index: 20;
    padding: 10px;
    box-sizing: border-box;
    display: flex;
    justify-content: center;
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
    /* 固定顶部内边距 */
    padding-top: 75px;
  }

  /* 固定底部区域 */
  .fixed-bottom {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    background-color: rgba(255, 255, 255, 0.95);
    backdrop-filter: blur(5px);
    /* 移除顶部的阴影，去除分界线 */
    /* box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.06); */
    /* <<--- 注释掉或删除此行 */
    padding: 10px;
    padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 10px);
    z-index: 30;
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  /* 输入框和免责声明样式 (保持不变) */
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

  /* 滚动条样式 (保持不变) */
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
