<!-- src/components/ChatInput.vue -->
<script setup lang="ts">
import { ref } from 'vue';
import { ElInput, ElButton, ElIcon, ElMessage, ElTooltip } from 'element-plus';
import { Paperclip, Mic, Close, Promotion } from '@element-plus/icons-vue';

const props = defineProps<{
  disabled: boolean; // 是否禁用输入
}>();

const emits = defineEmits<{
  (e: 'send-message', payload: { query: string; files: File[] }): void;
}>();

// --- State ---
const inputValue = ref('');
const selectedFiles = ref<File[]>([]);
const fileInputRef = ref<HTMLInputElement | null>(null);

// --- Methods --- (Keep existing methods: handleSend, triggerFileUpload, etc.)
const handleSend = () => {
  if (!props.disabled && (inputValue.value.trim() || selectedFiles.value.length > 0)) {
    emits('send-message', {
      query: inputValue.value.trim(),
      files: [...selectedFiles.value],
    });
    inputValue.value = '';
    clearSelectedFiles();
  }
};

const triggerFileUpload = () => {
  if (!props.disabled) {
    fileInputRef.value?.click();
  }
};

const handleFileChange = (event: Event) => {
  const target = event.target as HTMLInputElement;
  if (target.files) {
    const limit = 5; // Example limit
    if (target.files.length + selectedFiles.value.length > limit) {
      ElMessage.warning(`最多只能上传 ${limit} 个文件。`);
      target.value = '';
      return;
    }
    selectedFiles.value.push(...Array.from(target.files));
    target.value = '';
  }
};

const removeFile = (index: number) => {
  selectedFiles.value.splice(index, 1);
};

const clearSelectedFiles = () => {
  selectedFiles.value = [];
   if (fileInputRef.value) {
      fileInputRef.value.value = '';
   }
};

const handleKeydown = (event: Event) => {

    const keyboardEvent = event as KeyboardEvent;
    if (keyboardEvent.key === 'Enter' && !keyboardEvent.shiftKey) {
        event.preventDefault();
        handleSend();
    }
};

const handleVoiceInput = () => {
   if (!props.disabled) {
       ElMessage.info('语音输入功能待实现');
       // Add recording logic here
   }
};

</script>

<template>
  <div class="chat-input-container">
    <!-- Hidden File Input -->
    <input
      type="file"
      ref="fileInputRef"
      style="display: none"
      multiple
      @change="handleFileChange"
      :disabled="props.disabled"
      accept="image/*, application/pdf, text/plain, .doc, .docx, .xls, .xlsx, .ppt, .pptx, .md, .csv, .eml, .msg, .xml, .epub, audio/*, video/*" />

    <!-- Simplified Selected Files Display (optional, can be removed for cleaner look) -->
    <div v-if="selectedFiles.length > 0" class="selected-files-minimal">
      <span v-for="(file, index) in selectedFiles" :key="index" class="file-tag">
        <el-icon><Paperclip /></el-icon> {{ file.name }}
        <el-icon class="remove-icon" @click="removeFile(index)" :disabled="props.disabled"><Close /></el-icon>
      </span>
       <el-button text type="danger" size="small" @click="clearSelectedFiles" :disabled="props.disabled" class="clear-all-minimal">清除</el-button>
    </div>

    <!-- Main Input Area -->
    <ElInput
      v-model="inputValue"
      type="textarea"
      :autosize="{ minRows: 1, maxRows: 5 }"
      placeholder="询问任何问题"
      :disabled="props.disabled"
      @keydown="handleKeydown"
      class="main-input-textarea"
      resize="none"
    />

    <!-- Action Buttons Footer -->
    <div class="input-actions-footer">
      <div class="left-actions">
         <!-- File Upload Button - minimal style -->
         <ElTooltip content="附加文件" placement="top">
            <el-button
                text
                :icon="Paperclip"
                @click="triggerFileUpload"
                :disabled="props.disabled"
                class="minimal-action-btn" />
          </ElTooltip>
          <!-- Add other minimal buttons here if needed -->
      </div>

      <div class="right-actions">
        <!-- Voice Button - Styled like image -->
        <ElTooltip content="语音输入" placement="top">
            <el-button
                round
                :icon="Mic"
                @click="handleVoiceInput"
                :disabled="props.disabled"
                class="voice-btn"
            />
                <!-- Text "语音" removed to fit better as an icon button -->
        </ElTooltip>
         <!-- Send Button - Styled like voice button -->
        <ElButton
            round
            type="primary"
            @click="handleSend"
            :disabled="props.disabled || (!inputValue.trim() && selectedFiles.length === 0)"
            class="send-styled-btn"
            :icon="Promotion"
        >
            发送
        </ElButton>
      </div>
    </div>
  </div>
</template>

<style scoped>
.chat-input-container {
  padding: 10px 15px 10px 15px; /* Reduced bottom padding slightly */
  background-color: #ffffff; /* White background */
  border: 1px solid #e5e7eb; /* Light border */
  border-radius: 24px; /* Very rounded corners like the image */
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05); /* Subtle shadow */
  display: flex;
  flex-direction: column;
}

/* Minimal Selected Files */
.selected-files-minimal {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-bottom: 8px;
  font-size: 0.8rem;
  padding-left: 5px; /* Align with text area padding */
  align-items: center;
}

.file-tag {
  background-color: #f3f4f6;
  padding: 2px 6px;
  border-radius: 12px; /* Pill shape */
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: #4b5563;
}

.file-tag .remove-icon {
  cursor: pointer;
  color: #9ca3af;
}
.file-tag .remove-icon:hover {
  color: #ef4444;
}
.clear-all-minimal {
    margin-left: auto;
    font-size: 0.8rem;
    padding: 0 5px;
    color: #6b7280;
}
.clear-all-minimal:hover {
    color: #ef4444;
}


/* Main Text Area Styling */
.main-input-textarea {
  width: 100%;
}
/* Target inner textarea */
.main-input-textarea :deep(.el-textarea__inner) {
  background-color: transparent !important; /* Make background transparent */
  border: none !important; /* Remove border */
  box-shadow: none !important; /* Remove shadow */
  padding: 10px 5px; /* Adjust padding */
  line-height: 1.6;
  font-size: 1rem; /* Slightly larger font */
  color: #1f2937; /* Darker text */
  resize: none !important;
  min-height: 30px !important; /* Adjust min height */
  border-radius: 0; /* Remove internal radius */
}
/* Placeholder styling */
.main-input-textarea :deep(.el-textarea__inner::placeholder) {
  color: #9ca3af; /* Lighter placeholder text like image */
  font-weight: 400;
}

/* Footer for buttons */
.input-actions-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 8px; /* Space above buttons */
  padding: 0 5px; /* Align button edges with text area padding */
}

.left-actions, .right-actions {
  display: flex;
  align-items: center;
  gap: 8px; /* Spacing between buttons */
}

/* Minimal Button Style (for upload) */
.minimal-action-btn {
  color: #6b7280; /* Grey icon color */
  padding: 5px; /* Small padding for icon button */
  border: none;
  background: none;
}
.minimal-action-btn:hover {
  color: #1f2937;
  background-color: #f3f4f6;
}

/* Voice Button Style (like image) */
.voice-btn {
  background-color: #1f2937 !important; /* Dark background */
  color: #ffffff !important; /* White icon */
  border: none !important;
  width: 36px; /* Fixed size */
  height: 36px;
  padding: 0;
}
.voice-btn:hover {
  background-color: #374151 !important;
}
.voice-btn .el-icon {
    font-size: 18px; /* Adjust icon size */
}

/* Send Button Style (similar to voice) */
.send-styled-btn {
  background-color: #1f2937 !important; /* Dark background */
  color: #ffffff !important; /* White text/icon */
  border: none !important;
  height: 36px;
  padding: 0 15px; /* Padding for text */
  font-weight: 500;
}
.send-styled-btn:hover {
  background-color: #374151 !important;
}
.send-styled-btn[disabled] {
   background-color: #9ca3af !important;
   opacity: 0.7;
}
.send-styled-btn .el-icon {
    margin-right: 4px; /* Space between icon and text */
    font-size: 16px;
}

</style>