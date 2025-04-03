export interface ChatMessageRequest {
    query: string;
    inputs: Record<string, any>;
    response_mode: 'streaming' | 'blocking';
    user: string;
    conversation_id?: string;
    files?: Array<{
      type: string;
      transfer_method: 'remote_url' | 'local_file';
      url?: string;
      upload_file_id?: string;
    }>;
    auto_generate_name?: boolean;
  }
  
  export interface ChatCompletionResponse {
    message_id: string;
    conversation_id: string;
    mode: string;
    answer: string;
    metadata: {
      usage: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
        total_price: string;
        currency: string;
      };
      retriever_resources: Array<{
        position: number;
        dataset_id: string;
        dataset_name: string;
        document_id: string;
        document_name: string;
        segment_id: string;
        score: number;
        content: string;
      }>;
    };
    created_at: number;
  }