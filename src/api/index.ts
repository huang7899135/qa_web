import axios from 'axios';
import type { AxiosResponse } from 'axios';

// --- 类型定义 ---
// (建议将这些类型移到单独的 .d.ts 文件或 types 文件夹中统一管理)

/**
 * 文件对象接口 (用于请求体)
 */
export interface RequestFile {
  type: 'document' | 'image' | 'audio' | 'video' | 'custom'; // 文件类型
  transfer_method: 'remote_url' | 'local_file'; // 传递方式
  url?: string; // 图片地址 (仅当 transfer_method 为 remote_url 时)
  upload_file_id?: string; // 上传文件 ID (仅当 transfer_method 为 local_file 时)
}

/**
 * 发送聊天消息请求体接口
 */
export interface ChatMessageRequest {
  query: string; // 用户输入/提问内容
  inputs: Record<string, any>; // App 定义的变量值，默认为 {}
  response_mode: 'streaming' | 'blocking'; // 响应模式
  user: string; // 用户标识
  conversation_id?: string; // 会话 ID (可选)
  files?: RequestFile[]; // 文件列表 (可选)
  auto_generate_name?: boolean; // 自动生成标题 (可选, 默认 true)
}

/**
 * 模型用量信息接口
 */
export interface Usage {
  prompt_tokens?: number;
  prompt_unit_price?: string;
  prompt_price_unit?: string;
  prompt_price?: string;
  completion_tokens?: number;
  completion_unit_price?: string;
  completion_price_unit?: string;
  completion_price?: string;
  total_tokens?: number;
  total_price?: string;
  currency?: string;
  latency?: number;
}

/**
 * 引用和归属分段信息接口
 */
export interface RetrieverResource {
  position: number;
  dataset_id?: string;
  dataset_name?: string;
  document_id?: string;
  document_name?: string;
  segment_id?: string;
  retriever_from?: string; // 'workflow' 等
  score?: number;
  hit_count?: number;
  word_count?: number;
  segment_position?: number;
  index_node_hash?: string;
  content: string;
  doc_metadata?: any;
  page?: number | null;
}

/**
 * 阻塞模式聊天完成响应接口
 */
export interface ChatCompletionResponse {
  message_id: string; // 消息唯一 ID
  conversation_id: string; // 会话 ID
  mode: string; // App 模式 (固定为 chat)
  answer: string; // 完整回复内容
  metadata?: { // 元数据 (可选)
    usage?: Usage;
    retriever_resources?: RetrieverResource[];
    [key: string]: any; // 允许其他未知属性
  };
  retriever_resources?: RetrieverResource[]; // 旧版可能在此层级，兼容性考虑
  created_at: number; // 消息创建时间戳
}

/**
 * 流式块基础接口 (包含通用字段)
 */
interface ChunkBase {
  event: string; // 事件类型
  task_id?: string; // 任务 ID
  message_id?: string; // 消息 ID
  conversation_id?: string; // 会话 ID
  created_at?: number; // 创建时间戳
}

/**
 * 流式块 - message 事件接口
 */
export interface ChunkMessage extends ChunkBase {
  event: 'message';
  id: string; // 确认文档中 message 事件有 id 字段
  answer: string; // LLM 返回文本块内容
}

/**
 * 流式块 - message_file 事件接口
 */
export interface ChunkMessageFile extends ChunkBase {
  event: 'message_file';
  id: string; // 文件唯一 ID
  type: string; // 文件类型 (例如 'image')
  belongs_to: 'user' | 'assistant'; // 文件归属
  url: string; // 文件访问地址
}

/**
 * 流式块 - message_end 事件接口
 */
export interface ChunkMessageEnd extends ChunkBase {
  event: 'message_end';
  id: string; // 确认文档中 message_end 事件有 id 字段
  metadata?: { // 元数据 (可选)
    usage?: Usage;
    retriever_resources?: RetrieverResource[];
    [key: string]: any;
  };
  usage?: Usage; // 旧版可能在此层级
  retriever_resources?: RetrieverResource[]; // 旧版可能在此层级
}

/**
 * 流式块 - tts_message 事件接口
 */
export interface ChunkTTSMessage extends ChunkBase {
    event: 'tts_message';
    audio: string; // Base64 编码的音频块
}

/**
 * 流式块 - tts_message_end 事件接口
 */
export interface ChunkTTSMessageEnd extends ChunkBase {
    event: 'tts_message_end';
    audio: string; // 空字符串
}


/**
 * 流式块 - message_replace 事件接口
 */
export interface ChunkMessageReplace extends ChunkBase {
  event: 'message_replace';
  answer: string; // 替换内容
}

/**
 * 流式块 - workflow_started 事件接口
 */
export interface ChunkWorkflowStarted extends ChunkBase {
  event: 'workflow_started';
  workflow_run_id: string;
  data: {
    id: string;
    workflow_id: string;
    sequence_number: number;
    inputs?: Record<string, any>;
    created_at: number;
    [key: string]: any;
  };
}

/**
 * 流式块 - node_started 事件接口
 */
export interface ChunkNodeStarted extends ChunkBase {
  event: 'node_started';
  workflow_run_id: string;
  data: {
    id: string;
    node_id: string;
    node_type: string;
    title: string;
    index: number;
    predecessor_node_id: string | null;
    inputs: Record<string, any> | null;
    created_at: number;
    [key: string]: any;
  };
}

/**
 * 流式块 - node_finished 事件接口
 */
export interface ChunkNodeFinished extends ChunkBase {
  event: 'node_finished';
  workflow_run_id: string;
  data: {
    id: string;
    node_id: string;
    node_type: string;
    title: string;
    index: number;
    predecessor_node_id: string | null;
    inputs?: Record<string, any>;
    process_data?: any;
    outputs?: any;
    status: 'running' | 'succeeded' | 'failed' | 'stopped';
    error?: string | null;
    elapsed_time?: number;
    execution_metadata?: {
        total_tokens?: number;
        total_price?: string;
        currency?: string;
        [key: string]: any;
    } | null;
    created_at: number;
    finished_at?: number;
    files?: any[];
    [key: string]: any;
  };
}

/**
 * 流式块 - workflow_finished 事件接口
 */
export interface ChunkWorkflowFinished extends ChunkBase {
  event: 'workflow_finished';
  workflow_run_id: string;
  data: {
    id: string;
    workflow_id: string;
    sequence_number?: number; // 文档中有，但示例没有，设为可选
    status: 'succeeded' | 'failed' | 'stopped'; // running 状态应该不会在 finished 事件出现
    outputs?: any;
    error?: string | null;
    elapsed_time?: number;
    total_tokens?: number;
    total_steps?: number;
    created_by?: { id: string; user: string; }; // 示例中有，文档没有，设为可选
    created_at: number;
    finished_at: number;
    exceptions_count?: number; // 示例中有，文档没有，设为可选
    files?: any[]; // 示例中有，文档没有，设为可选
    [key: string]: any;
  };
}

/**
 * 流式块 - error 事件接口
 */
export interface ChunkError extends ChunkBase {
  event: 'error';
  status?: number; // HTTP 状态码 (可选)
  code?: string; // 错误码 (可选)
  message: string; // 错误消息
}

/**
 * 流式块 - ping 事件接口
 */
export interface ChunkPing extends ChunkBase {
    event: 'ping';
}


/**
 * 流式块响应联合类型
 * (注意：添加了所有文档中定义的 event 类型)
 */
export type ChunkChatCompletionResponse =
  | ChunkMessage
  | ChunkMessageFile
  | ChunkMessageEnd
  | ChunkTTSMessage
  | ChunkTTSMessageEnd
  | ChunkMessageReplace
  | ChunkWorkflowStarted
  | ChunkNodeStarted
  | ChunkNodeFinished
  | ChunkWorkflowFinished
  | ChunkError
  | ChunkPing;

/**
 * 文件上传响应接口
 */
export interface FileUploadResponse {
  id: string; // UUID
  name: string; // 文件名
  size: number; // 文件大小 (byte)
  extension: string; // 文件后缀
  mime_type: string; // 文件 mime-type
  created_by: string | number; // 上传人 ID (文档是 uuid，示例是 int，用联合类型)
  created_at: number; // 上传时间戳
}

/**
 * 消息反馈请求体接口
 */
export interface FeedbackRequest {
  rating: 'like' | 'dislike' | null; // 点赞状态
  user: string; // 用户标识
  content?: string; // 反馈内容 (可选)
}

/**
 * 建议问题响应接口
 */
export interface SuggestedQuestionsResponse {
  result: string; // 固定 "success"
  data: string[]; // 问题列表
}

/**
 * 历史消息项接口 (简化版，可根据需要扩展)
 */
export interface HistoryMessage {
  id: string;
  conversation_id: string;
  inputs: Record<string, any>;
  query: string;
  message_files?: Array<{
      id: string;
      type: string;
      url: string;
      belongs_to: 'user' | 'assistant';
  }>;
  answer: string;
  created_at: number;
  feedback?: {
    rating: 'like' | 'dislike' | null;
    [key: string]: any; // 可能有其他反馈字段
  } | null;
  retriever_resources?: RetrieverResource[];
  agent_thoughts?: any[]; // Agent 思维过程 (如果开启)
  [key: string]: any; // 允许其他未知属性
}

/**
 * 获取历史消息响应接口
 */
export interface MessagesResponse {
  limit: number; // 返回条数
  has_more: boolean; // 是否有更多
  data: HistoryMessage[]; // 消息列表
}

/**
 * 会话项接口 (简化版)
 */
export interface Conversation {
  id: string;
  name: string;
  inputs: Record<string, any>;
  status: string; // "normal", etc.
  introduction?: string;
  created_at: number;
  updated_at?: number; // 示例中有，文档中无
  [key: string]: any;
}

/**
 * 获取会话列表响应接口
 */
export interface ConversationsResponse {
  limit: number;
  has_more: boolean;
  data: Conversation[];
}

/**
 * 会话重命名请求体接口
 */
export interface RenameConversationRequest {
  name?: string; // 名称 (可选)
  auto_generate?: boolean; // 自动生成 (可选, 默认 false)
  user: string; // 用户标识
}

/**
 * 语音转文字响应接口
 */
export interface AudioToTextResponse {
  text: string; // 输出文字
}

/**
 * 文字转语音请求体接口
 */
export interface TextToAudioRequest {
  message_id?: string; // 消息 ID (可选)
  text?: string; // 文本内容 (可选)
  user: string; // 用户标识
}

/**
 * 应用基本信息响应接口
 */
export interface AppInfoResponse {
  name: string;
  description: string;
  tags: string[];
}

/**
 * 应用参数响应接口 (结构复杂多变，使用 any 或 Record<string, any>)
 * 可以根据实际需要定义更具体的结构
 */
export interface AppParametersResponse {
  opening_statement?: string;
  suggested_questions?: string[];
  suggested_questions_after_answer?: {
    enabled?: boolean;
  };
  speech_to_text?: {
    enabled?: boolean;
  };
  retriever_resource?: {
    enabled?: boolean;
  };
  annotation_reply?: {
    enabled?: boolean;
  };
  user_input_form?: Array<Record<string, any>>; // 表单配置数组
  file_upload?: {
    image?: {
      enabled?: boolean;
      number_limits?: number;
      transfer_methods?: ('remote_url' | 'local_file')[];
    };
    // 可能还有其他文件类型配置
  };
  system_parameters?: {
    file_size_limit?: number;
    image_file_size_limit?: number;
    audio_file_size_limit?: number;
    video_file_size_limit?: number;
    [key: string]: any;
  };
  [key: string]: any; // 允许其他顶层属性
}

/**
 * 应用 Meta 信息响应接口
 */
export interface AppMetaResponse {
  tool_icons?: Record<string, { // 工具名称 -> 图标信息
    background?: string; // hex 背景色
    content?: string; // emoji
    url?: string; // 图标 URL
  } | string>; // 可能是 URL 字符串
}


// --- API 配置 ---
// 请确认端口号 :1080 是否正确
const BASE_URL = 'http://tunnel.gycloud.net:1080/v1';
// 请替换为你的真实 API Key
const API_KEY = 'app-F7R3XyL6n93EHmg9gc53lHhp';

export { BASE_URL }; // 导出 BASE_URL 供外部使用

// 创建 axios 实例，用于非流式请求
const requests = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Authorization': `Bearer ${API_KEY}`,
    'Content-Type': 'application/json', // 默认 Content-Type
  },
});

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

  try {
    const response = await fetch(`${BASE_URL}/chat-messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
      signal: abortController.signal, // 关联 AbortController
    });

    // 检查 HTTP 状态码
    if (!response.ok) {
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
                             console.error('解析流式块失败 (EOF):', jsonStr, e);
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
                console.error('解析流式块失败:', jsonStr, e);
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
        } else if (!(error instanceof Error)){
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
      abort: () => {},
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
      '/chat-messages',
      requestData
    );
    return response.data;
  } catch (error) {
    console.error('发送对话消息(阻塞模式)失败:', error);
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
      '/files/upload',
      formData,
      {
        // axios 会自动为 FormData 设置正确的 Content-Type，但如果需要明确指定也可以
        headers: { 'Content-Type': 'multipart/form-data' },
      }
    );
    return response.data;
  } catch (error) {
    console.error('上传文件失败:', error);
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
      `/chat-messages/${task_id}/stop`, // 使用模板字符串构建 URL
      { user } // 请求体包含 user
    );
    return response.data;
  } catch (error) {
    console.error('停止响应失败:', error);
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
      `/messages/${message_id}/feedbacks`,
      data
    );
    return response.data;
  } catch (error) {
    console.error('发送反馈失败:', error);
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
      `/messages/${message_id}/suggested`,
      { params: { user } } // 将 user 作为查询参数
    );
    return response.data;
  } catch (error) {
    console.error('获取建议问题失败:', error);
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

    const response: AxiosResponse<MessagesResponse> = await requests.get('/messages', { params });
    return response.data;
  } catch (error) {
    console.error('获取历史消息失败:', error);
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

    const response: AxiosResponse<ConversationsResponse> = await requests.get('/conversations', { params });
    return response.data;
  } catch (error) {
    console.error('获取会话列表失败:', error);
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
      `/conversations/${conversation_id}`,
      // axios 的 delete 方法将请求体放在 data 属性中
      { data: { user } }
    );
    return response.data;
  } catch (error) {
    console.error('删除会话失败:', error);
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
      `/conversations/${conversation_id}/name`,
      data
    );
    return response.data;
  } catch (error) {
    console.error('重命名会话失败:', error);
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
      '/audio-to-text',
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );
    return response.data;
  } catch (error) {
    console.error('语音转文字失败:', error);
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
    const response: AxiosResponse<Blob> = await requests.post('/text-to-audio', data, {
      responseType: 'blob',
    });
    return response.data;
  } catch (error) {
    console.error('文字转语音失败:', error);
    throw error;
  }
}

/**
 * 获取应用基本信息
 * @returns 返回应用名称、描述和标签
 */
export async function getAppInfo(): Promise<AppInfoResponse> { // 使用定义的接口
  try {
    const response: AxiosResponse<AppInfoResponse> = await requests.get('/info');
    return response.data;
  } catch (error) {
    console.error('获取应用信息失败:', error);
    throw error;
  }
}

/**
 * 获取应用参数
 * @returns 返回应用的参数配置
 */
export async function getAppParameters(): Promise<AppParametersResponse> { // 使用定义的接口
  try {
    const response: AxiosResponse<AppParametersResponse> = await requests.get('/parameters');
    return response.data;
  } catch (error) {
    console.error('获取应用参数失败:', error);
    throw error;
  }
}

/**
 * 获取应用 Meta 信息 (例如工具图标)
 * @returns 返回应用的 Meta 信息
 */
export async function getAppMeta(): Promise<AppMetaResponse> { // 使用定义的接口
  try {
    const response: AxiosResponse<AppMetaResponse> = await requests.get('/meta');
    return response.data;
  } catch (error) {
    console.error('获取应用 Meta 信息失败:', error);
    throw error;
  }
}