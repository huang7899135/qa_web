<!-- src/components/ChatMessages.vue -->
<template>
  <div class="chat-messages" ref="messagesContainer">
    <!-- 使用 transition-group 包裹消息循环 -->
    <transition-group name="message-transition" tag="div" class="message-list-wrapper">
      <!-- 每个消息项作为 transition-group 的子元素 -->
      <div v-for="(msg) in messages" :key="msg.id" :class="['message-wrapper', msg.role]">
          <div :class="['message', msg.role]">
              <!-- 加载指示器: 仅当是助手消息、正在处理中且尚无内容时显示 -->
              <template v-if="msg.role === 'assistant' && msg.isProcessing && !msg.content">
                <div class="loading-indicator">
                  <span class="dot"></span>
                  <span class="dot"></span>
                  <span class="dot"></span>
                </div>
              </template>

              <!-- 实际消息内容: 仅当有内容或处理完成时显示 -->
              <template v-else>
                <!-- 显示消息内容 -->
                <div class="content" v-html="renderMarkdown(msg.content)"></div>

                <!-- 显示消息文件 (保持不变) -->
                <div v-if="msg.message_files && msg.message_files.length > 0" class="message-files">
                    <div v-for="file in msg.message_files" :key="file.id" class="file-display">
                    <el-image
                        v-if="file.type === 'image'"
                        :src="file.url"
                        :preview-src-list="[file.url]"
                        fit="contain" lazy class="message-image" hide-on-click-modal />
                    <a v-else :href="file.url" target="_blank" rel="noopener noreferrer" class="file-link">
                        <el-icon><Document /></el-icon>
                        {{ getFileNameFromUrl(file.url) || '附件' }}
                    </a>
                    </div>
                </div>

                <!-- 显示错误标记 (保持不变) -->
                <div v-if="msg.metadata?.error" class="metadata error-flag">
                     <el-icon><WarningFilled /></el-icon> (发生错误)
                </div>

                 <!-- 助手消息的复制按钮 (保持不变) -->
                 <div v-if="msg.role === 'assistant' && msg.content" class="copy-action">
                     <el-tooltip content="复制" placement="top" :enterable="false">
                        <el-button
                            text
                            circle
                            size="small"
                            :icon="CopyDocument"
                            @click="copyToClipboard(msg.content)"
                            class="copy-btn"
                        />
                     </el-tooltip>
                 </div>
              </template>

              <!-- 点赞/点踩/朗读 操作按钮区域已被移除 -->
          </div>
      </div>
    </transition-group> <!-- 结束 transition-group -->
  </div>
</template>

<script setup lang="ts">
// 移除未使用的导入: Headset, Top, Bottom, Link
import { ref, watch, nextTick, onMounted } from 'vue';
// ElButton 可能仍需要用于 copy 按钮, ElTooltip 也是
import { ElImage, ElIcon, ElButton, ElTooltip, ElMessage } from 'element-plus';
// 移除未使用的图标: Headset, Top, Bottom, Link
// 引入复制图标: CopyDocument
import { Document, WarningFilled, CopyDocument } from '@element-plus/icons-vue';
import MarkdownIt from 'markdown-it';

// --- Markdown 渲染器 (保持不变) ---
const md = new MarkdownIt({
  html: false, // 通常不直接渲染 HTML 以防 XSS，除非你完全信任来源或做了净化
  linkify: true, // 自动将 URL 转为链接
  typographer: true, // 启用一些标点符号和引用的美化
});
const renderMarkdown = (text: string = '') => {
    // 【重要】在生产环境中，如果 Markdown 内容可能来自不可信来源，
    // 请务必使用 DOMPurify 或类似库对 md.render() 的结果进行净化！
    // import DOMPurify from 'dompurify';
    // return DOMPurify.sanitize(md.render(text));
    return md.render(text); // 返回渲染后的 HTML 字符串
};

// --- 接口定义 (添加 isProcessing) ---
interface RetrieverResource { /* ... */ } // 如需使用，保持定义
interface MessageFile { id: string; type: string; url: string; belongs_to: 'user' | 'assistant'; }
// interface MessageFeedback { /* ... */ } // 已移除

interface Message {
  id: string; // 消息唯一 ID
  role: 'user' | 'assistant'; // 角色：用户或助手
  content: string; // 消息文本内容
  message_files?: MessageFile[]; // 关联的文件
  metadata?: { // 元数据
    retriever_resources?: RetrieverResource[]; // 引用来源 (如果使用)
    error?: boolean; // 是否为错误消息
    usage?: object; // token 使用情况等 (如果需要)
    [key: string]: any; // 其他可能的元数据
  };
  created_at?: number; // 创建时间戳 (秒)
  isProcessing?: boolean; // 新增：标记助手消息是否仍在生成中
}

// --- Props (保持不变) ---
const props = defineProps<{
  messages: Message[]; // 接收消息数组
}>();

// --- Emits (移除) ---
// const emits = defineEmits<{ ... }>(); // 已移除

// --- Refs & Lifecycle (保持不变) ---
const messagesContainer = ref<HTMLDivElement | null>(null); // 对消息容器元素的引用

// 滚动到底部的函数
const scrollToBottom = async (behavior: ScrollBehavior = 'smooth') => {
  // 等待 DOM 更新完成
  await nextTick();
  if (messagesContainer.value) {
    // 执行滚动
    messagesContainer.value.scrollTo({ top: messagesContainer.value.scrollHeight, behavior: behavior });
  }
};

// 监听消息数组的变化，自动滚动到底部
watch(() => props.messages, (newMessages, oldMessages) => {
    // 如果是新增消息，使用平滑滚动；如果是加载历史记录等，可能用 'auto' 瞬间滚动
    const behavior = newMessages.length > oldMessages.length ? 'smooth' : 'auto';
    scrollToBottom(behavior);
}, { deep: true }); // 深度监听，确保消息内部属性变化也能触发

// 组件挂载后滚动到底部
onMounted(() => {
  scrollToBottom('auto'); // 初始加载，瞬间滚动
});

// --- Methods ---

// 移除 emitFeedback, emitPlayAudio

// 保留: 从 URL 获取文件名
const getFileNameFromUrl = (url: string): string | null => {
    try {
        // 尝试使用 URL API 解析
        const pathname = new URL(url).pathname;
        const parts = pathname.split('/');
        return decodeURIComponent(parts[parts.length - 1]) || null; // 解码文件名
    } catch (e) {
        // 如果 URL 无效，尝试简单分割
        const parts = url.split('/');
        const possibleFilename = parts[parts.length - 1];
        // 尝试去除可能的查询参数
        const queryIndex = possibleFilename.indexOf('?');
        return decodeURIComponent(queryIndex !== -1 ? possibleFilename.substring(0, queryIndex) : possibleFilename) || null;
    }
};

// 保留: 复制到剪贴板方法
const copyToClipboard = async (text: string) => {
    if (!navigator.clipboard) {
        // 兼容性检查
        ElMessage.error('您的浏览器不支持或未启用剪贴板功能');
        return;
    }
    try {
        // 执行复制
        await navigator.clipboard.writeText(text);
        ElMessage.success('已复制到剪贴板');
    } catch (err) {
        console.error('无法复制文本: ', err);
        ElMessage.error('复制失败，请检查浏览器权限或手动复制');
    }
};

</script>

<style scoped>
.chat-messages {
  flex-grow: 1; /* 占据可用垂直空间 */
  overflow-y: auto; /* 超出内容时垂直滚动 */
  padding: 20px 15px; /* 增加上下内边距 */
  background-color: #ffffff; /* 纯白背景 */
  display: flex;
  flex-direction: column; /* 垂直排列消息 */
}

/* transition-group 需要一个包裹元素，这里我们添加一个 */
.message-list-wrapper {
    display: flex;
    flex-direction: column;
    gap: 20px; /* 设置消息之间的间距 */
}

.message-wrapper {
  display: flex;
  /* margin-bottom: 20px; */ /* 使用 gap 代替 margin */
  max-width: calc(100% - 40px); /* 限制最大宽度，两侧留有空间 */
  width: fit-content; /* 让包裹器宽度适应内容 */
}
.message-wrapper.user {
    align-self: flex-end; /* 用户消息靠右 */
    margin-left: auto; /* 确保在 flex 容器中靠右 */
}
.message-wrapper.assistant {
    align-self: flex-start; /* 助手消息靠左 */
    margin-right: auto; /* 确保在 flex 容器中靠左 */
}

.message {
  /* padding: 10px 15px; */ /* 内边距由子元素或特定角色定义 */
  border-radius: 20px; /* 非常圆润的边角 (对 user 生效) */
  word-wrap: break-word; /* 长单词换行 */
  position: relative; /* 用于复制按钮等绝对定位子元素 */
  line-height: 1.6; /* 改善可读性 */
  font-size: 14px; /* 标准字体大小 */
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04); /* 轻微阴影 (对 user 生效) */
  min-height: 20px; /* 确保即使内容为空也有最小高度 */
}

/* 用户消息样式 */
.message.user {
  padding: 8px 15px; /* 用户消息内边距 */
  background-color: #f4f4f5; /* 浅灰色背景 */
  color: #1f2937; /* 深灰色文字 */
  border-bottom-right-radius: 6px; /* 轻微调整右下角形状 */
}

/* 助手消息样式 */
.message.assistant {
  background-color: transparent; /* 无背景 */
  color: #1f2937; /* 深灰色文字 */
  padding: 0; /* 移除内边距，文本直接显示 */
  border: none; /* 移除边框 */
  box-shadow: none; /* 移除阴影 */
  border-radius: 0; /* 无圆角 */
  /* 如果需要为加载状态或内容设置一个最小宽度，可以在这里加 min-width */
}

.content {
  /* white-space: pre-wrap; */ /* markdown-it 会处理换行 */
  white-space: normal; /* 确保浏览器正常处理换行 */
}

/* 调整 Markdown 内部样式，适应无背景情况 */
/* 使用 :deep() 或 ::v-deep 穿透 scoped CSS */
.message.assistant .content :deep(p) { margin: 0 0 0.5em 0; }
.message.assistant .content :deep(p:last-child) { margin-bottom: 0; }
.message.assistant .content :deep(a) { color: #3b82f6; text-decoration: underline;} /* 蓝色链接 */
.message.assistant .content :deep(code):not(pre code) { /* 行内代码 */
    background-color: #f3f4f6;
    padding: 0.1em 0.4em;
    border-radius: 4px;
    font-size: 0.9em;
    color: #4b5563;
    word-break: break-all; /* 代码内允许断词 */
}
.message.assistant .content :deep(pre) { /* 代码块 */
    background-color: #f3f4f6;
    padding: 10px;
    border-radius: 6px;
    margin: 0.5em 0;
    overflow-x: auto; /* 水平滚动 */
    font-size: 0.9em;
}
.message.assistant .content :deep(pre code) { /* 代码块内的 code 标签 */
    background: none;
    padding: 0;
    color: inherit; /* 继承 pre 的颜色 */
    word-break: normal; /* 代码块内不随意断词 */
    white-space: pre; /* 保持代码格式 */
}
.message.assistant .content :deep(blockquote) { /* 引用块 */
    border-left: 3px solid #d1d5db;
    padding-left: 10px;
    margin: 0.5em 0 0.5em 0;
    color: #4b5563;
}
.message.assistant .content :deep(ul),
.message.assistant .content :deep(ol) { /* 列表 */
    margin: 0.5em 0 0.5em 20px; /* 列表的内外边距 */
    padding-left: 20px;
}
.message.assistant .content :deep(li) { /* 列表项 */
    margin-bottom: 0.3em;
}

/* --- 新增：加载指示器样式 --- */
.loading-indicator {
  display: flex;
  align-items: center;
  justify-content: flex-start; /* 让点靠左 */
  padding: 8px 0px; /* 给点一些垂直空间，与文本大致对齐 */
  min-height: 20px; /* 确保有高度 */
}

.loading-indicator .dot {
  display: inline-block;
  width: 7px; /* 点的大小 */
  height: 7px; /* 点的大小 */
  margin-right: 4px; /* 点之间的距离 */
  border-radius: 50%;
  background-color: #9ca3af; /* 点的颜色 (灰色) */
  animation: loading-pulse 1.4s infinite ease-in-out both; /* 应用动画 */
}
/* 动画延迟，制造依次跳动的效果 */
.loading-indicator .dot:nth-child(1) {
  animation-delay: -0.32s;
}
.loading-indicator .dot:nth-child(2) {
  animation-delay: -0.16s;
}
/* 最后一个点不需要右边距 */
.loading-indicator .dot:last-child {
    margin-right: 0;
}

/* 定义跳动动画 */
@keyframes loading-pulse {
  0%, 80%, 100% {
    transform: scale(0.8); /* 缩小状态 */
    opacity: 0.5; /* 半透明 */
  }
  40% {
    transform: scale(1); /* 放大状态 */
    opacity: 1; /* 完全不透明 */
  }
}

/* --- 新增：消息过渡动画 --- */
.message-transition-enter-active,
.message-transition-leave-active {
  transition: all 0.4s cubic-bezier(0.25, 0.8, 0.25, 1); /* 定义过渡效果 */
}
/* 进入动画的起始状态 */
.message-transition-enter-from {
  opacity: 0;
  transform: translateY(15px) scale(0.98); /* 从下方轻微上移并放大 */
}
/* 离开动画的结束状态 (通常较少用到，但可以定义) */
.message-transition-leave-to {
  opacity: 0;
  transform: scale(0.95); /* 离开时轻微缩小 */
}


/* 消息文件区域 (保持不变) */
.message-files { margin-top: 8px; display: flex; flex-wrap: wrap; gap: 8px; }
.file-display { max-width: 150px; }
.message-image { display: block; width: 100%; height: auto; max-height: 150px; object-fit: contain; border-radius: 6px; cursor: pointer; border: 1px solid #eee;}
.file-link { display: inline-flex; align-items: center; padding: 5px 8px; background-color: #f0f0f0; border-radius: 4px; color: #333; text-decoration: none; font-size: 0.9em; word-break: break-all; }
.file-link:hover { background-color: #e0e0e0; }
.file-link .el-icon { margin-right: 4px; }

/* 错误标记 (保持不变) */
.metadata.error-flag {
    margin-top: 8px;
    color: #ef4444;
    font-weight: 500;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 0.85em;
}

/* 复制按钮样式 (保持不变) */
.copy-action {
    margin-top: 5px;
    text-align: left; /* 确保按钮在左侧 */
    height: 20px; /* 控制区域高度 */
    opacity: 0; /* 默认隐藏 */
    transition: opacity 0.2s ease-in-out; /* 平滑显示 */
}
/* 消息悬停时显示复制按钮 */
.message-wrapper:hover .copy-action {
    opacity: 1;
}

.copy-btn {
    padding: 2px !important; /* 非常小的内边距 */
    color: #9ca3af; /* 灰色图标 */
    font-size: 14px; /* 图标大小 */
    border-radius: 4px;
}
.copy-btn:hover {
    color: #1f2937; /* 悬停时变深 */
    background-color: #f3f4f6; /* 轻微背景 */
}
</style>
