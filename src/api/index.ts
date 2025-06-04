import axios from 'axios';
import type { AxiosResponse } from 'axios';
import type { AppInfoResponse, AppMetaResponse, AppParametersResponse, AudioToTextResponse, ChatCompletionResponse, ChatMessageRequest, ChunkChatCompletionResponse, ChunkPing, Conversation, ConversationsResponse, FeedbackRequest, FileUploadResponse, MessagesResponse, RecommendedQuestionsResponse, RenameConversationRequest, SuggestedQuestionsResponse, TextToAudioRequest } from './types';
import { handleLoginRedirect } from '@/utils/auth';


// --- API 配置 ---
const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://admin.visionblue.cloud/api';
export { BASE_URL }; // 导出 BASE_URL 供外部使用

// 导入认证工具函数

function getToken(): string | null {
  return localStorage.getItem('jwt_token');
}

// 创建 axios 实例，用于非流式请求
const requests = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// --- Axios 请求拦截器 ---
requests.interceptors.request.use(
  config => {
    const token = getToken();
    if (token) {
      // 如果存在 Token，则添加到 Authorization Header
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    return config;
  },
  error => {
    // 对请求错误做些什么
    return Promise.reject(error);
  }
);
// --- Axios 响应拦截器 ---
requests.interceptors.response.use(
  response => response,
  error => {
    if (error.response && (error.response.status === 401 || error.response.status === 403)) {
      handleLoginRedirect('Axios 响应拦截器检测到认证错误');
      // 返回一个 pending 的 Promise，阻止后续错误处理
      return new Promise(() => { });
    }
    return Promise.reject(error);
  }
);

/**
 * 发送对话消息 (流式)
 * @param data 请求体
 * @param onMessage 收到消息块的回调
 * @param onError 发生错误的回调
 * @returns 返回一个包含 abort 方法的对象，用于中断请求
 */
export async function sendChatMessageStream(
  data: ChatMessageRequest,
  onMessage: (chunk: ChunkChatCompletionResponse) => void,
  onError: (error: any) => void
): Promise<{ abort: () => void }> {
  const abortController = new AbortController();
  const token = getToken(); // 获取当前 Token
  if (!token) {
    onError(new Error('Token 不存在，请先登录'));
    return { abort: () => { } }; // 终止后续处理
  }
  try {
    const response = await fetch(`${BASE_URL}/qa/ai/chat-messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
      signal: abortController.signal, // 关联 AbortController
    });

    // 检查 HTTP 状态码
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        handleLoginRedirect('sendChatMessageStream 检测到认证错误');
        return { abort: () => { } }; // 终止后续处理
      }
      // 尝试解析错误响应体
      let errorBody = null;
      try {
        errorBody = await response.json();
      } catch (e) {
        // 如果响应体不是 JSON 或解析失败，忽略
      }
      // 抛出包含状态码和可能错误信息的 Error 对象
      throw new Error(`HTTP 错误！状态码: ${response.status}. ${errorBody ? JSON.stringify(errorBody) : response.statusText}`);
    }

    // 获取响应流读取器
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('无法获取响应流读取器');
    }

    let buffer = ''; // 用于存储未处理完的流数据
    const decoder = new TextDecoder('utf-8'); // 使用 UTF-8 解码

    // 异步处理流数据
    const processStream = async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          // 流结束
          if (done) {
            // 处理可能残留在 buffer 中的最后一块数据
            if (buffer.trim()) {
              if (buffer.startsWith('data: ')) {
                const jsonStr = buffer.slice(6).trim();
                if (jsonStr) {
                  try {
                    const chunk = JSON.parse(jsonStr) as ChunkChatCompletionResponse;
                    onMessage(chunk);
                  } catch (e) {
                    // console.error('解析流式块失败 (EOF):', jsonStr, e);
                    // 可以在这里调用 onError，或者根据需要忽略解析错误
                    // onError(new Error(`解析流式块失败 (EOF): ${e.message}`));
                  }
                }
              } else if (buffer.startsWith('event: ')) {
                // 处理非 data: 开头的 ping 事件等
                if (buffer.trim() === 'event: ping') {
                  onMessage({ event: 'ping' } as ChunkPing);
                }
              }
            }
            break; // 退出循环
          }

          // 解码当前块并追加到缓冲区
          buffer += decoder.decode(value, { stream: true });
          // 按 '\n\n' 分割 SSE 事件块
          const lines = buffer.split('\n\n');

          // 处理所有完整的事件块 (除了最后一个，因为它可能不完整)
          for (let i = 0; i < lines.length - 1; i++) {
            const line = lines[i].trim();
            if (line.startsWith('data: ')) {
              const jsonStr = line.slice(6); // 移除 "data: "
              try {
                const chunk = JSON.parse(jsonStr) as ChunkChatCompletionResponse;
                onMessage(chunk); // 调用回调函数处理块
              } catch (e) {
                // console.error('解析流式块失败:', jsonStr, e);
                // 可以在这里决定是否调用 onError
                // onError(new Error(`解析流式块失败: ${e.message}`));
              }
            } else if (line.startsWith('event: ')) {
              // 处理非 data: 开头的事件，例如 ping
              if (line === 'event: ping') {
                onMessage({ event: 'ping' } as ChunkPing);
              }
              // 可以根据需要处理其他 event 类型
            }
          }
          // 保留最后一个（可能不完整的）块到缓冲区，供下次读取时拼接
          buffer = lines[lines.length - 1];
        }
      } catch (error) {
        // 检查是否是用户主动中断
        if (error instanceof Error && error.name !== 'AbortError') {
          onError(error); // 如果不是主动中断，则调用错误回调
        } else if (!(error instanceof Error)) {
          onError(error); // 处理非 Error 类型的异常
        }
        // 如果是 AbortError，通常不需要调用 onError，因为是用户主动行为
      } finally {
        reader.releaseLock(); // 释放读取器锁
      }
    };

    processStream(); // 启动流处理

    // 返回包含 abort 方法的对象
    return {
      abort: () => abortController.abort(),
    };
  } catch (error) {
    onError(error); // 如果在 fetch 或获取 reader 时出错，调用错误回调
    // 返回一个无操作的 abort 方法
    return {
      abort: () => { },
    };
  }
}

/**
 * 发送对话消息 (阻塞模式)
 * @param data 请求体
 * @returns 返回完整的聊天响应
 */
export async function sendChatMessageBlocking(
  data: ChatMessageRequest
): Promise<ChatCompletionResponse> {
  try {
    // 确保 response_mode 为 blocking
    const requestData = { ...data, response_mode: 'blocking' };
    const response: AxiosResponse<ChatCompletionResponse> = await requests.post(
      '/qa/ai/chat-messages',
      requestData
    );
    return response.data;
  } catch (error) {
    // console.error('发送对话消息(阻塞模式)失败:', error);
    throw error; // 重新抛出错误，让调用者处理
  }
}

/**
 * 上传文件
 * @param file 要上传的文件对象
 * @param user 用户标识
 * @returns 返回文件上传的响应信息
 */
export async function uploadFile(file: File, user: string): Promise<FileUploadResponse> {
  const formData = new FormData();
  formData.append('file', file); // key 必须是 'file'
  formData.append('user', user); // key 必须是 'user'

  try {
    const response: AxiosResponse<FileUploadResponse> = await requests.post(
      '/ai/files/upload',
      formData,
      {
        // axios 会自动为 FormData 设置正确的 Content-Type，但如果需要明确指定也可以
        headers: { 'Content-Type': 'multipart/form-data' },
      }
    );
    return response.data;
  } catch (error) {
    // console.error('上传文件失败:', error);
    throw error;
  }
}

/**
 * 停止响应 (仅用于流式模式)
 * @param task_id 任务 ID (从流式块中获取)
 * @param user 用户标识
 * @returns 返回操作结果
 */
export async function stopResponse(
  task_id: string,
  user: string
): Promise<{ result: string }> {
  try {
    const response: AxiosResponse<{ result: string }> = await requests.post(
      `/ai/chat-messages/${task_id}/stop`, // 使用模板字符串构建 URL
      { user } // 请求体包含 user
    );
    return response.data;
  } catch (error) {
    // console.error('停止响应失败:', error);
    throw error;
  }
}

/**
 * 消息反馈 (点赞/点踩)
 * @param message_id 消息 ID
 * @param data 反馈数据 (rating, user, content?)
 * @returns 返回操作结果
 */
export async function sendFeedback(
  message_id: string,
  data: FeedbackRequest // 使用定义的接口
): Promise<{ result: string }> {
  try {
    const response: AxiosResponse<{ result: string }> = await requests.post(
      `/ai/messages/${message_id}/feedbacks`,
      data
    );
    return response.data;
  } catch (error) {
    // console.error('发送反馈失败:', error);
    throw error;
  }
}

/**
 * 获取下一轮建议问题列表
 * @param message_id 消息 ID
 * @param user 用户标识
 * @returns 返回建议问题列表
 */
export async function getSuggestedQuestions(
  message_id: string,
  user: string
): Promise<SuggestedQuestionsResponse> { // 使用定义的接口
  try {
    const response: AxiosResponse<SuggestedQuestionsResponse> = await requests.get(
      `/ai/messages/${message_id}/suggested`,
      { params: { user } } // 将 user 作为查询参数
    );
    return response.data;
  } catch (error) {
    // console.error('获取建议问题失败:', error);
    throw error;
  }
}

/**
 * 获取会话历史消息
 * @param conversation_id 会话 ID
 * @param user 用户标识
 * @param first_id 当前页第一条消息 ID (可选, 用于分页)
 * @param limit 返回条数 (可选, 默认 20)
 * @returns 返回历史消息列表及分页信息
 */
export async function getMessages(
  conversation_id: string,
  user: string,
  first_id?: string, // first_id 用于向后加载旧消息
  limit?: number
): Promise<MessagesResponse> { // 使用定义的接口
  try {
    const params: Record<string, any> = { conversation_id, user };
    if (first_id) params.first_id = first_id;
    if (limit) params.limit = limit;

    const response: AxiosResponse<MessagesResponse> = await requests.get('/ai/messages', { params });
    return response.data;
  } catch (error) {
    // console.error('获取历史消息失败:', error);
    throw error;
  }
}

/**
 * 获取会话列表
 * @param user 用户标识
 * @param last_id 当前页最后一条记录 ID (可选, 用于分页)
 * @param limit 返回条数 (可选, 默认 20)
 * @param sort_by 排序字段 (可选, 默认 -updated_at)
 * @returns 返回会话列表及分页信息
 */
export async function getConversations(
  user: string,
  last_id?: string, // last_id 用于加载更多新会话
  limit?: number,
  sort_by?: 'created_at' | '-created_at' | 'updated_at' | '-updated_at' // 限制可选值
): Promise<ConversationsResponse> { // 使用定义的接口
  try {
    const params: Record<string, any> = { user };
    if (last_id) params.last_id = last_id;
    if (limit) params.limit = limit;
    if (sort_by) params.sort_by = sort_by;

    const response: AxiosResponse<ConversationsResponse> = await requests.get('/ai/conversations', { params });
    return response.data;
  } catch (error) {
    // console.error('获取会话列表失败:', error);
    throw error;
  }
}

/**
 * 删除会话
 * @param conversation_id 会话 ID
 * @param user 用户标识
 * @returns 返回操作结果
 */
export async function deleteConversation(
  conversation_id: string,
  user: string
): Promise<{ result: string }> {
  try {
    const response: AxiosResponse<{ result: string }> = await requests.delete(
      `/ai/conversations/${conversation_id}`,
      // axios 的 delete 方法将请求体放在 data 属性中
      { data: { user } }
    );
    return response.data;
  } catch (error) {
    // console.error('删除会话失败:', error);
    throw error;
  }
}

/**
 * 会话重命名
 * @param conversation_id 会话 ID
 * @param data 重命名数据 (name?, auto_generate?, user)
 * @returns 返回更新后的会话信息
 */
export async function renameConversation(
  conversation_id: string,
  data: RenameConversationRequest // 使用定义的接口
): Promise<Conversation> { // 返回更具体的 Conversation 类型
  try {
    const response: AxiosResponse<Conversation> = await requests.post(
      `/ai/conversations/${conversation_id}/name`,
      data
    );
    return response.data;
  } catch (error) {
    // console.error('重命名会话失败:', error);
    throw error;
  }
}

/**
 * 语音转文字
 * @param file 语音文件
 * @param user 用户标识
 * @returns 返回转换后的文字
 */
export async function audioToText(file: File, user: string): Promise<AudioToTextResponse> { // 使用定义的接口
  const formData = new FormData();
  formData.append('file', file);
  formData.append('user', user);

  try {
    const response: AxiosResponse<AudioToTextResponse> = await requests.post(
      '/ai/audio-to-text',
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );
    return response.data;
  } catch (error) {
    // console.error('语音转文字失败:', error);
    throw error;
  }
}

/**
 * 文字转语音
 * @param data 请求数据 (message_id?, text?, user)
 * @returns 返回包含音频数据的 Blob 对象
 */
export async function textToAudio(data: TextToAudioRequest): Promise<Blob> { // 使用定义的接口
  try {
    // responseType: 'blob' 告诉 axios 期望接收二进制数据
    const response: AxiosResponse<Blob> = await requests.post('/ai/text-to-audio', data, {
      responseType: 'blob',
    });
    return response.data;
  } catch (error) {
    // console.error('文字转语音失败:', error);
    throw error;
  }
}

/**
 * 获取应用基本信息
 * @returns 返回应用名称、描述和标签
 */
export async function getAppInfo(): Promise<AppInfoResponse> { // 使用定义的接口
  try {
    const response: AxiosResponse<AppInfoResponse> = await requests.get('/ai/info');
    return response.data;
  } catch (error) {
    // console.error('获取应用信息失败:', error);
    throw error;
  }
}

/**
 * 获取应用参数
 * @returns 返回应用的参数配置
 */
export async function getAppParameters(): Promise<AppParametersResponse> { // 使用定义的接口
  try {
    const response: AxiosResponse<AppParametersResponse> = await requests.get('/ai/parameters');
    return response.data;
  } catch (error) {
    // console.error('获取应用参数失败:', error);
    throw error;
  }
}

/**
 * 获取应用 Meta 信息 (例如工具图标)
 * @returns 返回应用的 Meta 信息
 */
export async function getAppMeta(): Promise<AppMetaResponse> { // 使用定义的接口
  try {
    const response: AxiosResponse<AppMetaResponse> = await requests.get('/ai/meta');
    return response.data;
  } catch (error) {
    // console.error('获取应用 Meta 信息失败:', error);
    throw error;
  }
}

/**
 * 获取推荐问题分类列表
 * @returns 返回推荐问题分类列表
 */
export async function getRecommendedQuestions(): Promise<RecommendedQuestionsResponse> {
  try {
    const response: AxiosResponse<RecommendedQuestionsResponse> = await requests.get(
      '/qa/public/categories',
    );
    return response.data;
  } catch (error) {
    // console.error('获取推荐问题失败:', error);
    throw error;
  }
}