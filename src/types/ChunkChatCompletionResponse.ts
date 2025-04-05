// src/types/ChunkChatCompletionResponse.ts

// 基础接口，包含所有事件共有的字段
interface BaseChunk {
  event: string; // 事件类型
  task_id?: string; // 任务 ID，可选
  message_id?: string; // 消息 ID，可选
  conversation_id?: string; // 会话 ID，可选
  created_at?: number; // 创建时间戳，可选
}

// 用量元数据，用于 message_end 事件
interface Usage {
  prompt_tokens: number; // 提示词 token 数
  completion_tokens: number; // 完成 token 数
  total_tokens: number; // 总 token 数
  total_price: string; // 总费用
  currency: string; // 货币类型
}

// 检索资源，用于 message_end 事件
interface RetrieverResource {
  position: number; // 位置
  dataset_id: string; // 数据集 ID
  dataset_name: string; // 数据集名称
  document_id: string; // 文档 ID
  document_name: string; // 文档名称
  segment_id: string; // 段落 ID
  score: number; // 相关性得分
  content: string; // 内容
}

// 事件: message - LLM 返回文本块
interface MessageChunk extends BaseChunk {
  event: 'message';
  id: string; // 消息唯一 ID，与示例中的 "id" 保持一致
  answer: string; // LLM 返回的文本块内容
}

// 事件: message_file - 文件事件
interface MessageFileChunk extends BaseChunk {
  event: 'message_file';
  id: string; // 文件唯一 ID
  type: 'image'; // 文件类型，目前仅支持 image
  belongs_to: 'user' | 'assistant'; // 文件归属
  url: string; // 文件访问地址
}

// 事件: message_end - 消息结束
interface MessageEndChunk extends BaseChunk {
  event: 'message_end';
  metadata: {
    usage: Usage; // 用量信息
    retriever_resources: RetrieverResource[]; // 检索资源列表
  };
}

// 事件: tts_message - TTS 音频流
interface TTSMessageChunk extends BaseChunk {
  event: 'tts_message';
  audio: string; // Base64 编码的音频块
}

// 事件: tts_message_end - TTS 音频流结束
interface TTSMessageEndChunk extends BaseChunk {
  event: 'tts_message_end';
  audio: string; // 结束事件为空字符串
}

// 事件: message_replace - 消息内容替换
interface MessageReplaceChunk extends BaseChunk {
  event: 'message_replace';
  answer: string; // 替换后的内容
}

// 事件: workflow_started - Workflow 开始执行
interface WorkflowStartedChunk extends BaseChunk {
  event: 'workflow_started';
  workflow_run_id: string; // Workflow 执行 ID
  data: {
    id: string; // Workflow 执行 ID
    workflow_id: string; // 关联 Workflow ID
    sequence_number: number; // 自增序号
    created_at: number; // 开始时间戳
  };
}

// 事件: node_started - 节点开始执行
interface NodeStartedChunk extends BaseChunk {
  event: 'node_started';
  workflow_run_id: string; // Workflow 执行 ID
  data: {
    id: string; // Workflow 执行 ID
    node_id: string; // 节点 ID
    node_type: string; // 节点类型
    title: string; // 节点名称
    index: number; // 执行序号
    predecessor_node_id?: string; // 前置节点 ID，可选
    inputs: Record<string, any>; // 输入变量
    created_at: number; // 开始时间戳
  };
}

// 事件: node_finished - 节点执行结束
interface NodeFinishedChunk extends BaseChunk {
  event: 'node_finished';
  workflow_run_id: string; // Workflow 执行 ID
  data: {
    id: string; // 节点执行 ID
    node_id: string; // 节点 ID
    index: number; // 执行序号
    predecessor_node_id?: string; // 前置节点 ID，可选
    inputs: Record<string, any>; // 输入变量
    process_data?: any; // 过程数据，可选
    outputs?: any; // 输出内容，可选
    status: 'running' | 'succeeded' | 'failed' | 'stopped'; // 执行状态
    error?: string; // 错误原因，可选
    elapsed_time?: number; // 耗时，可选
    execution_metadata?: {
      total_tokens?: number; // 总 token 数，可选
      total_price?: number; // 总费用，可选
      currency?: string; // 货币类型，可选
    };
    created_at: number; // 开始时间戳
  };
}

// 事件: workflow_finished - Workflow 执行结束
interface WorkflowFinishedChunk extends BaseChunk {
  event: 'workflow_finished';
  workflow_run_id: string; // Workflow 执行 ID
  data: {
    id: string; // Workflow 执行 ID
    workflow_id: string; // 关联 Workflow ID
    status: 'running' | 'succeeded' | 'failed' | 'stopped'; // 执行状态
    outputs?: any; // 输出内容，可选
    error?: string; // 错误原因，可选
    elapsed_time?: number; // 耗时，可选
    total_tokens?: number; // 总 token 数，可选
    total_steps: number; // 总步数
    created_at: number; // 开始时间戳
    finished_at: number; // 结束时间戳
  };
}

// 事件: error - 流式输出异常
interface ErrorChunk extends BaseChunk {
  event: 'error';
  status: number; // HTTP 状态码
  code: string; // 错误码
  message: string; // 错误消息
}

// 事件: ping - 保持连接存活
interface PingChunk {
  event: 'ping';
}

// 联合类型，涵盖所有可能的流式块
export type ChunkChatCompletionResponse =
  | MessageChunk
  | MessageFileChunk
  | MessageEndChunk
  | TTSMessageChunk
  | TTSMessageEndChunk
  | MessageReplaceChunk
  | WorkflowStartedChunk
  | NodeStartedChunk
  | NodeFinishedChunk
  | WorkflowFinishedChunk
  | ErrorChunk
  | PingChunk;