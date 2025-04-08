<!-- src/components/ChatMessages.vue -->
<template>
  <div class="chat-messages">
    <!-- 使用 transition-group 实现消息列表动画 -->
    <transition-group name="message-transition" tag="div" class="message-list-wrapper">
      <!-- 循环渲染每条消息 -->
      <div v-for="(msg) in messages" :key="msg.id" :class="['message-wrapper', msg.role]">
        <div :class="['message', msg.role]">

          <!-- === 助手消息 (Assistant) - 流式处理逻辑 === -->
          <template v-if="msg.role === 'assistant'">
            <!-- 统一的消息内容容器 -->
            <div class="assistant-content-area">
              <!--
                加载指示器:
                仅在消息正在处理中 (isProcessing=true) 且 内容完全为空 (content='') 时显示。
              -->
              <div class="loading-indicator" v-if="msg.isProcessing && msg.content === ''">
                <span class="dot"></span>
                <span class="dot"></span>
                <span class="dot"></span>
              </div>

              <!--
                消息文本内容:
                使用 v-if 确保只在 content 确实有值时渲染 Markdown。
              -->
              <div class="content" v-if="msg.content" v-html="renderMarkdown(msg.content)"></div>

              <!-- 消息文件列表 (如果有) -->
              <div v-if="msg.message_files && msg.message_files.length > 0" class="message-files">
                <div v-for="file in msg.message_files" :key="file.id" class="file-display">
                  <!-- 图片文件 -->
                  <el-image v-if="file.type === 'image'" :src="file.url" :preview-src-list="[file.url]" fit="contain"
                    lazy class="message-image" hide-on-click-modal />
                  <!-- 其他文件类型 (链接) -->
                  <a v-else :href="file.url" target="_blank" rel="noopener noreferrer" class="file-link">
                    <el-icon>
                      <Document />
                    </el-icon>
                    {{ getFileNameFromUrl(file.url) || '附件' }}
                  </a>
                </div>
              </div>

              <!-- 消息引用列表 (如果有) -->
              <MessageReferences :metadata="msg.metadata" />

              <!-- 错误标记 (在 message_end 中设置 metadata.error) -->
              <div v-if="msg.metadata?.error" class="metadata error-flag">
                <el-icon>
                  <WarningFilled />
                </el-icon> (发生错误)
              </div>

              <!--
                 复制按钮:
                 仅当有内容时显示。
               -->
              <div v-if="msg.content" class="copy-action">
                <el-tooltip content="复制" placement="top" :enterable="false">
                  <el-button text circle size="small" :icon="CopyDocument" @click="copyToClipboard(msg.content)"
                    class="copy-btn" />
                </el-tooltip>
              </div>
            </div>
          </template>

          <!-- === 用户消息 (User) === -->
          <template v-else>
            <!-- 消息文本内容 -->
            <div class="content" v-html="renderMarkdown(msg.content)"></div>

            <!-- 消息文件列表 (如果有) -->
            <div v-if="msg.message_files && msg.message_files.length > 0" class="message-files">
              <div v-for="file in msg.message_files" :key="file.id" class="file-display">
                <!-- 图片文件 -->
                <el-image v-if="file.type === 'image'" :src="file.url" :preview-src-list="[file.url]" fit="contain" lazy
                  class="message-image" hide-on-click-modal />
                <!-- 其他文件类型 (链接) -->
                <a v-else :href="file.url" target="_blank" rel="noopener noreferrer" class="file-link">
                  <el-icon>
                    <Document />
                  </el-icon>
                  {{ getFileNameFromUrl(file.url) || '附件' }}
                </a>
              </div>
            </div>
          </template>

        </div>
      </div>
    </transition-group>
  </div>
</template>

<script setup lang="ts">
  // 核心 Vue API
  import { ref, watch, nextTick, onMounted } from 'vue';
  // Element Plus 组件
  import { ElImage, ElIcon, ElButton, ElTooltip } from 'element-plus';
  // Element Plus 图标
  import { Document, WarningFilled, CopyDocument } from '@element-plus/icons-vue';
  // Markdown 处理
  import MarkdownIt from 'markdown-it';
  // 引入 MessageReferences 组件
  import MessageReferences from './MessageReferences.vue';
  import { copyToClipboard } from '@/utils/clipboard.ts';
  // 消息类型定义
  import type { Message } from '@/types/ChatMessageType.ts';

  // --- Markdown 渲染器 ---
  const md = new MarkdownIt({
    html: false,
    linkify: true,
    typographer: true,
  });
  const renderMarkdown = (text: string = '') => {
    // 生产环境注意 XSS 净化
    return md.render(text);
  };

  // --- 组件 Props ---
  const props = defineProps<{
    messages: Message[]; // 由父组件维护和更新的消息数组
  }>();

  // --- DOM 引用 ---
  const messagesContainer = ref<HTMLDivElement | null>(null);

  // --- 滚动控制 ---
  const scrollToBottom = async (behavior: ScrollBehavior = 'smooth') => {
    await nextTick();
    const scrollContainer = document.querySelector('.scrollable-content');
    if (scrollContainer) {
      // 检查是否接近底部，如果是，则滚动；否则可能用户正在查看历史记录，不强制滚动
      const threshold = 100; // 距离底部的像素阈值
      const isNearBottom = messagesContainer.value &&
        scrollContainer.scrollHeight - messagesContainer.value.scrollTop - messagesContainer.value.clientHeight < threshold;

      // 只有当新消息是最后一条，或者容器当前就在底部附近时才滚动
      if (behavior === 'smooth' && !isNearBottom) {
        // 如果用户不在底部，且是平滑滚动（通常意味着是新消息），可以选择不滚动或提供一个"新消息"提示
      } else {
        scrollContainer.scrollTo({
          top: scrollContainer.scrollHeight,
          behavior: behavior
        });
      }
    }
  };

  // 监听消息数组的变化 (包括内部属性如 content, isProcessing)
  watch(() => props.messages, (newMessages, oldMessages) => {
    // 判断是新增消息还是内容更新
    const isNewMessageAdded = newMessages.length > oldMessages.length;
    // 查找最后一条消息是否正在流式更新 (它的 content 变化了但 isProcessing 还是 true)
    const lastMessage = newMessages[newMessages.length - 1];
    const oldLastMessage = oldMessages[oldMessages.length - 1];
    const isLastMessageStreaming = !isNewMessageAdded && newMessages.length > 0 &&
      lastMessage.id === oldLastMessage?.id &&
      lastMessage.role === 'assistant' &&
      lastMessage.isProcessing &&
      lastMessage.content !== oldLastMessage?.content;

    // 新增消息或流式更新最后一条消息时，平滑滚动
    // 其他情况（如加载历史）用 'auto'
    const behavior = (isNewMessageAdded || isLastMessageStreaming) ? 'smooth' : 'auto';

    scrollToBottom(behavior);
  }, { deep: true });

  // 组件挂载后滚动到底部
  onMounted(() => {
    scrollToBottom('auto');
  });

  // --- 工具函数 ---
  const getFileNameFromUrl = (url: string): string | null => {
    try {
      const pathname = new URL(url).pathname;
      const filename = decodeURIComponent(pathname.substring(pathname.lastIndexOf('/') + 1));
      return filename || null;
    } catch (e) {
      console.warn('无法解析文件名:', url, e);
      const parts = url.split('/');
      const possibleFilename = parts[parts.length - 1] || '';
      const queryIndex = possibleFilename.indexOf('?');
      const filename = decodeURIComponent(queryIndex !== -1 ? possibleFilename.substring(0, queryIndex) : possibleFilename);
      return filename || null;
    }
  };

</script>

<style scoped>

  /* --- 核心布局和通用样式 --- */
  .chat-messages {
    background-color: #ffffff;
    display: flex;
    flex-direction: column;
    width: 100%;
    /* 确保填满父容器 */
    height: auto;
    /* 自动高度 */
    overflow: visible;
    /* 显示溢出内容 */
  }

  .message-list-wrapper {
    display: flex;
    flex-direction: column;
    gap: 20px;
    padding-bottom: 15px;
  }

  .message-wrapper {
    display: flex;
    /* max-width: calc(100% - 40px); */
    width: fit-content;
  }

  .message-wrapper.user {
    align-self: flex-end;
    margin-left: auto;
  }

  .message-wrapper.assistant {
    align-self: flex-start;
    margin-right: auto;
  }

  .message {
    word-wrap: break-word;
    position: relative;
    line-height: 1.6;
    font-size: 14px;
    min-height: 20px;
  }

  /* --- 用户消息样式 --- */
  .message.user {
    padding: 8px 15px;
    background-color: #f4f4f5;
    color: #1f2937;
    border-radius: 20px;
    border-bottom-right-radius: 6px;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
  }

  /* --- 助手消息样式 --- */
  .message.assistant {
    background-color: transparent;
    color: #1f2937;
    padding: 0;
  }

  /* --- 助手内容区域 --- */
  .assistant-content-area {
    min-height: 20px;
    padding: 4px 0;
    position: relative;
    /* background-color: blue; */
  }

  /* --- 内容区域 --- */
  .content {
    white-space: normal;
  }

  .message.assistant .content {
    padding: 0;
  }

  /* --- 加载指示器 --- */
  .loading-indicator {
    display: flex;
    align-items: center;
    height: 20px;
  }

  .loading-indicator .dot {
    display: inline-block;
    width: 7px;
    height: 7px;
    margin-right: 4px;
    border-radius: 50%;
    background-color: #9ca3af;
    animation: loading-pulse 1.4s infinite ease-in-out both;
  }

  .loading-indicator .dot:nth-child(1) {
    animation-delay: -0.32s;
  }

  .loading-indicator .dot:nth-child(2) {
    animation-delay: -0.16s;
  }

  .loading-indicator .dot:last-child {
    margin-right: 0;
  }

  @keyframes loading-pulse {

    0%,
    80%,
    100% {
      transform: scale(0.8);
      opacity: 0.5;
    }

    40% {
      transform: scale(1);
      opacity: 1;
    }
  }


  .message-transition-enter-from {
    opacity: 0;
    transform: translateY(15px) scale(0.98);
  }

  .message-transition-leave-to {
    opacity: 0;
    transform: scale(0.95);
  }

  /* --- Markdown 内容样式 (:deep()) --- */
  .message .content :deep(p) {
    margin: 0 0 0.5em 0;
  }

  .message .content :deep(p:last-child) {
    margin-bottom: 0;
  }

  .message .content :deep(a) {
    color: #3b82f6;
    text-decoration: underline;
  }

  .message .content :deep(code):not(pre code) {
    background-color: #f3f4f6;
    padding: 0.1em 0.4em;
    border-radius: 4px;
    font-size: 0.9em;
    color: #4b5563;
    word-break: break-all;
  }

  .message .content :deep(pre) {
    background-color: #f3f4f6;
    padding: 10px;
    border-radius: 6px;
    margin: 0.5em 0;
    overflow-x: auto;
    font-size: 0.9em;
  }

  .message .content :deep(pre code) {
    background: none;
    padding: 0;
    color: inherit;
    word-break: normal;
    white-space: pre;
  }

  .message .content :deep(blockquote) {
    border-left: 3px solid #d1d5db;
    padding-left: 10px;
    margin: 0.5em 0;
    color: #4b5563;
  }

  .message .content :deep(ul),
  .message .content :deep(ol) {
    margin: 0.5em 0 0.5em 20px;
    padding-left: 20px;
  }

  .message .content :deep(li) {
    margin-bottom: 0.3em;
  }

  /* --- 消息文件样式 --- */
  .message-files {
    margin-top: 8px;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .file-display {
    max-width: 150px;
  }

  .message-image {
    display: block;
    width: 100%;
    height: auto;
    max-height: 150px;
    object-fit: contain;
    border-radius: 6px;
    cursor: pointer;
    border: 1px solid #eee;
  }

  .file-link {
    display: inline-flex;
    align-items: center;
    padding: 5px 8px;
    background-color: #f0f0f0;
    border-radius: 4px;
    color: #333;
    text-decoration: none;
    font-size: 0.9em;
    word-break: break-all;
  }

  .file-link:hover {
    background-color: #e0e0e0;
  }

  .file-link .el-icon {
    margin-right: 4px;
  }

  /* --- 元数据和操作按钮 --- */
  .metadata.error-flag {
    margin-top: 8px;
    color: #ef4444;
    font-weight: 500;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 0.85em;
  }

  .copy-action {
    margin-top: 5px;
    text-align: left;
    height: 20px;
    opacity: 0;
    transition: opacity 0.2s ease-in-out;
  }

  .message-wrapper:hover .copy-action {
    opacity: 1;
  }

  .copy-btn {
    padding: 2px !important;
    color: #9ca3af;
    font-size: 14px;
    border-radius: 4px;
  }

  .copy-btn:hover {
    color: #1f2937;
    background-color: #f3f4f6;
  }
</style>
