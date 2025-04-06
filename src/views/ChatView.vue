<!-- src/views/ChatWindow.vue -->
<template>
  <div class="chat-window">
    <ChatMessages class="chat-messages-area" :messages="messages" />
    <ChatInput class="chat-input-area" @send-message="handleSendMessage" :disabled="isUploading || isLoading" />
    <!-- 添加免责声明 -->
    <div class="disclaimer">
      成都金牛高新技术产业园区管委会提醒您。AI也会犯错,请核查重要信息。
    </div>
    <!-- 全局音频播放器 (保持，以备将来TTS等功能) -->
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
  } from '@/api';
  import type {
    ChunkChatCompletionResponse,
    ChatMessageRequest,
    RequestFile,
  } from '@/api';
  import type { Message } from '@/types/ChatMessageType.ts'; // 假设有一个类型定义文件

  import { ElMessage } from 'element-plus'; // 引入 ElMessage 用于错误提示



  // --- 组件状态 ---
  const messages = ref<Message[]>([]); // 聊天消息列表
  const isLoading = ref(false);       // 是否正在等待后端响应 (控制输入框禁用)
  const isUploading = ref(false);     // 是否正在上传文件 (控制输入框禁用)
  const conversationId = ref<string>(''); // 当前会话ID
  const userId = 'abc-123'; // 用户ID (应动态获取或配置)
  const audioPlayer = ref<HTMLAudioElement | null>(null); // 音频播放器引用
  let stopStreamHandler: { abort: () => void } | null = null; // 用于停止SSE流的处理器

  // --- 辅助函数 ---
  /** 生成唯一的临时ID */
  const generateTempId = (): string => `temp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  /** 根据ID查找消息在数组中的索引 */
  const findMessageIndexById = (id: string): number => messages.value.findIndex(msg => msg.id === id);

  // --- 文件上传 ---
  /** 处理文件上传并返回API所需格式 */
  const handleFileUpload = async (files: File[]): Promise<RequestFile[]> => {
    if (files.length === 0) return [];

    isUploading.value = true;
    let apiFiles: RequestFile[] = [];
    try {
      const uploadPromises = files.map(file => uploadFile(file, userId)); // 并行上传
      const uploadResults = await Promise.all(uploadPromises);

      apiFiles = uploadResults.map((result, index) => {
        const file = files[index];
        // 简单文件类型判断 (可根据后端要求细化)
        let apiType: RequestFile['type'] = 'custom';
        const fileMainType = file.type.split('/')[0];
        if (fileMainType === 'image') apiType = 'image';
        else if (fileMainType === 'audio') apiType = 'audio';
        else if (fileMainType === 'video') apiType = 'video';
        // 更多文档类型判断 (可扩展)
        else if (/\.(pdf|txt|md|docx?|xlsx?|pptx?|csv|eml|msg|xml|epub)$/i.test(file.name) || file.type.startsWith('text/') || file.type === 'application/pdf') {
          apiType = 'document';
        }
        return { type: apiType, transfer_method: 'local_file', upload_file_id: result.id };
      });
    } catch (error: any) {
      console.error('文件上传失败:', error);
      ElMessage.error(`文件上传失败: ${error.message || '未知错误'}`);
      throw error; // 抛出错误，中断发送流程
    } finally {
      isUploading.value = false;
    }
    return apiFiles;
  };

  // --- 发送消息处理 ---
  const handleSendMessage = async (payload: { query: string; files: File[] }) => {
    const { query, files } = payload;

    // 0. 如果正在加载或上传，则不处理
    if (isLoading.value || isUploading.value) return;

    // 1. 处理文件上传 (如果需要)
    let apiFiles: RequestFile[] = [];
    try {
      apiFiles = await handleFileUpload(files);
    } catch (uploadError) {
      return; // 上传失败则停止发送
    }

    // 2. 添加用户消息到列表
    const userMessageId = generateTempId(); // 用户消息也用临时ID，虽然通常不需要更新
    const userMessage: Message = {
      id: userMessageId,
      role: 'user',
      content: query,
      created_at: Date.now() / 1000,
      message_files: files.map(file => ({ // 如果需要在界面上立即显示用户上传的文件预览
        id: `local_${file.name}_${Date.now()}`, // 本地临时ID
        type: file.type.startsWith('image/') ? 'image' : 'file',
        url: URL.createObjectURL(file), // 创建本地预览URL
        belongs_to: 'user'
      })),
      isProcessing: false // 用户消息不是处理状态
    };
    messages.value.push(userMessage);

    // 3. 准备API请求参数
    isLoading.value = true; // 开始加载状态
    const request: ChatMessageRequest = {
      query: query,
      inputs: {}, // 如果需要传递额外输入
      response_mode: 'streaming',
      conversation_id: conversationId.value || undefined, // 如果有会话ID则传递
      user: userId,
      files: apiFiles // 包含上传后的文件信息
    };

    // 4. 创建助手消息占位符并添加到列表
    const assistantMessageTempId = generateTempId(); // 助手消息的临时ID
    let finalAssistantMessageId = ''; // 用于存储后端返回的最终消息ID
    const assistantMessagePlaceholder: Message = {
      id: assistantMessageTempId,
      role: 'assistant',
      content: '', // 必须为空字符串，以触发 ChatMessages 中的加载指示器
      isProcessing: true, // 标记为处理中
      message_files: [], // 初始化空文件列表
      metadata: {}, // 初始化空元数据
      created_at: Date.now() / 1000,
    };
    messages.value.push(assistantMessagePlaceholder);

    // 5. 定义 SSE 事件处理函数 (核心逻辑)
    const processChunk = (chunk: ChunkChatCompletionResponse) => {
      // 确定要查找的消息ID（优先使用最终ID，否则用临时ID）
      const lookupId = finalAssistantMessageId || assistantMessageTempId;
      const index = findMessageIndexById(lookupId);

      // 如果找不到对应的消息，则停止处理该 chunk (理论上不应发生)
      if (index === -1) {
        console.warn(`找不到 ID 为 ${lookupId} 的消息来处理 chunk:`, chunk);
        return;
      }

      // 更新会话 ID (如果首次返回)
      if (!conversationId.value && chunk.conversation_id) {
        conversationId.value = chunk.conversation_id;
      }

      // 更新助手消息的最终 ID (如果首次返回且与临时ID不同)
      // 后续事件（如 message_end）会使用这个最终 ID
      const chunkMessageId = chunk.message_id || (chunk.event !== 'ping' && chunk.event !== 'error' ? chunk.id : undefined);
      if (!finalAssistantMessageId && chunkMessageId && chunkMessageId !== assistantMessageTempId) {
        finalAssistantMessageId = chunkMessageId;
        messages.value[index].id = finalAssistantMessageId; // 更新消息数组中的ID
      }

      // 根据事件类型处理 chunk
      switch (chunk.event) {
        case 'message':
          // **流式核心：追加内容**
          messages.value[index].content += chunk.answer;
          break;

        case 'message_replace':
          // **流式策略：忽略此事件**
          // console.log('忽略 message_replace 事件:', chunk);
          break;

        case 'message_file':
          // 添加助手返回的文件
          if (!messages.value[index].message_files) {
            messages.value[index].message_files = [];
          }
          // 避免重复添加同一个文件
          if (!messages.value[index].message_files?.some(f => f.id === chunk.id)) {
            messages.value[index].message_files!.push({
              id: chunk.id, // 使用后端返回的文件ID
              type: chunk.type,
              url: chunk.url,
              belongs_to: 'assistant' // 明确属于助手
            });
          }
          break;

        case 'message_end':
          // **流式核心：标记结束并更新元数据**
          if (chunk.metadata) {
            // 合并元数据，保留可能已有的错误标记等
            messages.value[index].metadata = {
              ...messages.value[index].metadata,
              ...chunk.metadata // 使用后端返回的元数据覆盖或添加
            };
          }
          messages.value[index].isProcessing = false; // 标记处理完成
          isLoading.value = false; // 结束加载状态
          stopStreamHandler = null; // 清理停止处理器
          console.log('消息流结束:', finalAssistantMessageId || assistantMessageTempId);
          break;

        case 'workflow_started':
        case 'workflow_finished':
        case 'node_started':
        case 'node_finished':
             // 这些事件通常用于调试或显示更详细的流程状态，在此基础实现中暂时忽略
             // console.log(`流程事件: ${chunk.event}`, chunk.data?.title || chunk.data?.id);
             break;

        case 'ping':
          // 心跳事件，通常无需处理
          break;

        case 'error':
          // 处理流错误
          console.error('SSE 流错误:', chunk);
          messages.value[index].content = `发生错误: ${chunk.message || chunk.code || '未知流错误'}`;
          messages.value[index].metadata = { ...messages.value[index].metadata, error: true };
          messages.value[index].isProcessing = false; // 标记处理结束（因错误）
          if (stopStreamHandler) {
            stopStreamHandler.abort(); // 尝试停止流
          }
          isLoading.value = false; // 结束加载状态
          stopStreamHandler = null;
          ElMessage.error(`请求处理出错: ${chunk.message || chunk.code || '未知错误'}`);
          break;

        default:
          // 处理未知事件类型
          console.warn('未处理的 SSE 事件:', chunk);
      }
    };

    // 6. 定义错误处理函数
    const handleError = (error: any) => {
      console.error('发送消息或处理流时出错:', error);

      // 尝试找到对应的助手消息（可能只有临时ID）并标记错误
      const lookupId = finalAssistantMessageId || assistantMessageTempId;
      const index = findMessageIndexById(lookupId);
      const errorMessage = `请求失败: ${error.message || '网络错误或未知问题'}`;

      if (index !== -1) {
        messages.value[index].content = errorMessage;
        messages.value[index].metadata = { ...messages.value[index].metadata, error: true };
        messages.value[index].isProcessing = false;
      } else {
        // 如果连占位符都找不到（不太可能），可以添加一条新的错误消息
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
      isUploading.value = false; // 确保上传状态也复位
      stopStreamHandler = null;
      ElMessage.error(errorMessage);
    };

    // 7. 启动 SSE 请求
    try {
      // 调用 API 函数，传入请求、处理函数和错误处理函数
      stopStreamHandler = await sendChatMessageStream(request, processChunk, handleError);
    } catch (error) {
      // 处理 sendChatMessageStream 本身抛出的同步错误 (例如参数错误)
      handleError(error);
    }
  };

  // --- 加载历史消息 ---
  const loadHistory = async (convId: string) => {
    if (!convId) {
      console.warn("尝试加载历史记录，但未提供 conversationId");
      return;
    }
    isLoading.value = true; // 开始加载状态
    try {
      // 调用 API 获取历史消息，这里假设获取最近 20 条
      // limit 参数根据需要调整
      const response = await getMessages(convId, userId, undefined, 20);
      const historyMessages = response.data.reverse(); // API 返回可能是倒序的，确保按时间正序

      // 映射为前端 Message 格式
      messages.value = historyMessages.map(msg => ({
        id: msg.id,
        // 后端返回的结构可能需要判断是用户还是助手
        // 这里假设有 query 代表用户，有 answer 代表助手
        role: msg.query ? 'user' : 'assistant',
        content: msg.query || msg.answer,
        message_files: msg.message_files || [], // 确保是数组
        metadata: {
           retriever_resources: msg.retriever_resources,
           usage: msg.usage // 假设后端历史记录包含 usage
           // 如果有 error 状态也应映射: error: msg.error_status === 'failed' // 示例
         },
        created_at: msg.created_at,
        isProcessing: false, // 历史消息肯定不是正在处理状态
      }));
      conversationId.value = convId; // 更新当前会话ID
      ElMessage.success('历史消息加载成功');
    } catch (error: any) {
      console.error('加载历史消息失败:', error);
      ElMessage.error(`加载历史消息失败: ${error.message || '未知错误'}`);
      messages.value = []; // 加载失败清空消息
      conversationId.value = ''; // 清空会话ID
    } finally {
      isLoading.value = false; // 结束加载状态
    }
  };

  // --- 生命周期钩子 ---
  onMounted(() => {
    console.log("ChatWindow: Component mounted.");
    // 可以在这里尝试加载上一次的会话ID或默认加载某个会话
    // const lastConversationId = localStorage.getItem('lastConversationId');
    // if (lastConversationId) {
    //   loadHistory(lastConversationId);
    // }
  });

  // 可以在 onUnmounted 中清理资源，例如停止未完成的流
  // import { onUnmounted } from 'vue';
  // onUnmounted(() => {
  //   if (stopStreamHandler) {
  //     console.log("组件卸载，停止 SSE 流...");
  //     stopStreamHandler.abort();
  //   }
  // });

</script>

<style scoped>
  .chat-window {
    display: flex;
    flex-direction: column;
    height: 100vh;
    max-height: 100vh; /* 确保不超过视口高度 */
    overflow: hidden; /* 防止整个窗口滚动 */
    background-color: #ffffff;
    padding: 0 10px; /* 在主容器上保留水平内边距 */
    box-sizing: border-box;
  }

  /* 内容区域限制器 (用于居中和最大宽度) */
  .content-limiter {
    width: 100%;
    max-width: 800px; /* 设置所需的最大宽度 */
    margin-left: auto;
    margin-right: auto;
    box-sizing: border-box;
  }

  /* 消息显示区域 */
  .chat-messages-area {
    flex-grow: 1; /* 占据可用垂直空间 */
    overflow-y: auto; /* 仅允许此区域垂直滚动 */
    padding-top: 20px; /* 顶部空间 */
    padding-bottom: 10px; /* 消息和输入框之间的空间 */
    /* 应用内容限制器样式 */
    width: 100%;
    max-width: 800px;
    margin-left: auto;
    margin-right: auto;
    padding-left: 5px; /* 内部左右边距，可调整 */
    padding-right: 5px;
    box-sizing: border-box;
  }

  /* 输入区域 */
  .chat-input-area {
    flex-shrink: 0; /* 防止输入区域被压缩 */
    padding-top: 10px; /* 输入框上方空间 */
    padding-bottom: 10px; /* 输入框和免责声明之间的空间 */
    /* 应用内容限制器样式 */
    width: 100%;
    max-width: 800px;
    margin-left: auto;
    margin-right: auto;
    box-sizing: border-box;
  }

  /* 免责声明 */
  .disclaimer {
    margin-top: 3px; /* 与输入框的微小间距 */
    flex-shrink: 0; /* 防止被压缩 */
    text-align: center;
    font-size: 12px;
    color: #a0aec0; /* 灰色文字 */
    padding-bottom: 10px; /* 页面最底部的空间 */
    /* 应用内容限制器样式 */
    width: 100%;
    max-width: 800px;
    margin-left: auto;
    margin-right: auto;
    box-sizing: border-box;
  }

  /* --- 滚动条样式 (可选但推荐) --- */
  /* 隐藏主窗口滚动条 (理论上不应出现) */
  .chat-window::-webkit-scrollbar { display: none; }
  .chat-window { -ms-overflow-style: none; scrollbar-width: none; }

  /* 美化消息区域滚动条 */
  .chat-messages-area::-webkit-scrollbar { width: 6px; }
  .chat-messages-area::-webkit-scrollbar-track { background: #f1f1f1; border-radius: 3px; }
  .chat-messages-area::-webkit-scrollbar-thumb { background: #cccccc; border-radius: 3px; }
  .chat-messages-area::-webkit-scrollbar-thumb:hover { background: #aaaaaa; }
  .chat-messages-area { scrollbar-width: thin; scrollbar-color: #cccccc #f1f1f1; }

</style>