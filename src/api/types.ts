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
   * 推荐问题子问题接口
   */
  export interface RecommendedSubQuestion {
    text: string; // 问题文本
    query?: string | null; // 查询语句 (可选)
  }

  /**
   * 推荐问题分类接口
   */
  export interface RecommendedQuestionCategory {
    title: string; // 分类标题
    icon?: string; // 图标名称 (可选)
    description?: string; // 分类描述 (可选)
    questions: RecommendedSubQuestion[]; // 问题列表
  }

  /**
   * 推荐问题响应接口
   */
  export interface RecommendedQuestionsResponse {
    code: number; // 状态码
    message: string; // 响应消息
    data: RecommendedQuestionCategory[]; // 推荐问题分类列表
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