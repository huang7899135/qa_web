  // --- 消息接口定义 (与 ChatMessages.vue 保持一致) ---

  interface MessageFile {
    id: string;
    type: 'image' | 'file' | string;
    url: string;
    belongs_to: 'user' | 'assistant';
  }

  // 定义更详细的 Metadata 结构 (应与后端 message_end 事件的 metadata 匹配)
  export interface MessageMetadata {
    error?: boolean;
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
      [key: string]: any;
    };
    retriever_resources?: Array<{ 
      position: number;
      dataset_id?: string;       
      dataset_name?: string;     
      document_id?: string;      
      document_name?: string;    
      segment_id?: string;       
      retriever_from?: string;   
      score?: number;            
      hit_count?: number;        
      word_count?: number;       
      segment_position?: number; 
      index_node_hash?: string;  
      content: string;           
      doc_metadata?: any;        
      page?: number | null;      
      [key: string]: any;
    
    }>;
    [key: string]: any; // 允许其他元数据
  }

  export interface Message {
    id: string; // 对助手消息，初始为临时ID，后端返回最终ID后更新
    role: 'user' | 'assistant';
    content: string; // 对于助手消息，初始为空，流式追加
    isProcessing: boolean; // 助手消息处理状态
    message_files?: MessageFile[];
    metadata?: MessageMetadata;
    created_at?: number;
  }