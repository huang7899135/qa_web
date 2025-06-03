<template>
  <div class="welcome-panel">
    <!-- 固定的头部区域 - 现在整个区域可点击 -->
    <div class="panel-header" @click="togglePanel" role="button" tabindex="0" :aria-expanded="!isMinimized"
      :aria-label="isMinimized ? '展开推荐问题' : '收起推荐问题'">
      <!-- 标题内容 -->
      <div class="header-content">
        <h2>我是入园巴适智能问答助手</h2>

      </div>
      <!-- 展开/收起图标 - 放置在标题下方 -->
      <el-tooltip :content="isMinimized ? '展开推荐问题' : '收起推荐问题'" placement="bottom" :enterable="false">
        <el-icon class="header-toggle-icon">
          <!-- 根据状态切换图标 -->
          <component :is="isMinimized ? ArrowDown : ArrowUp" />
        </el-icon>
      </el-tooltip>
    </div>

    <!-- 可折叠的内容区域 (绝对定位，浮动效果) -->
    <transition name="slide-fade">
      <div v-show="!isMinimized" class="panel-collapsible-content">
        <!-- 提示信息 -->
        <p class="content-prompt">您可以直接提问，或从以下常见问题分类中选择：</p>

        <!-- 分类列表外部包裹器，用于控制滚动 -->
        <div class="categories-wrapper">
          <!-- 加载状态 -->
          <div v-if="loading" class="loading-container">
            <div class="loading-indicator">
              <span class="dot"></span><span class="dot"></span><span class="dot"></span>
            </div>
            <span>加载推荐问题中...</span>
          </div>

          <!-- 分类列表 -->
          <div v-else class="categories-container">
            <div v-for="(category, index) in categories" :key="category.title" class="category-card"
              :class="{ 'expanded': expandedCategory === index }">
              <!-- 分类标题栏 - 点击切换展开/折叠 -->
              <div class="category-header" @click.stop="toggleCategory(index)"> <!-- 使用 .stop 防止事件冒泡到 panel-header -->
                <div class="category-title">
                  <el-icon v-if="category.icon && icons[category.icon]">
                    <component :is="icons[category.icon]" />
                  </el-icon>
                  <h3>{{ category.title }}</h3>
                </div>
                <el-icon class="expand-icon" :class="{ 'is-expanded': expandedCategory === index }">
                  <ArrowDown />
                </el-icon>
              </div>

              <!-- 问题列表 -->
              <div v-show="expandedCategory === index" class="questions-list" :key="`questions-${index}`">
                <!-- 内部滚动容器 -->
                <div>
                  <div v-for="(question, qIndex) in category.questions" :key="qIndex"
                    @click="handleQuestionSelect(question)" class="question-item">
                    <span>{{ question.text }}</span>
                    <el-icon>
                      <ArrowRight />
                    </el-icon>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import { ElIcon, ElTooltip } from 'element-plus';
import * as ElementPlusIconsVue from '@element-plus/icons-vue';
import { ArrowDown, ArrowUp, ArrowRight } from '@element-plus/icons-vue';
import { getRecommendedQuestions } from '@/api'; // 导入 API 函数获取推荐问题

// 图标映射
const icons: Record<string, any> = ElementPlusIconsVue;

// --- 类型定义 ---
interface SubQuestion { text: string; query?: string | null; }
interface QuestionCategory { title: string; icon?: string; description?: string; questions: SubQuestion[]; }

// --- Props ---
const props = defineProps<{
  hasMessages: boolean; // 由父组件传入，指示是否有聊天消息
}>();

// --- Emits ---
const emit = defineEmits<{
  (e: 'select-question', questionText: string): void;
  // 移除 update:minimized
}>();

// --- 内部状态 ---
const loading = ref(true);
const categories = ref<QuestionCategory[]>([]);
const expandedCategory = ref<number | null>(null);
const isMinimized = ref(false); // 控制内容区域的显示/隐藏
const initialLoadDone = ref(false);


// 切换分类展开状态
const toggleCategory = (index: number) => {
  expandedCategory.value = expandedCategory.value === index ? null : index;
};

// 处理问题选择
const handleQuestionSelect = (question: SubQuestion) => {
  emit('select-question', question.query || question.text);
  // 选择问题后自动收起内容区域
  isMinimized.value = true;
  expandedCategory.value = null; // 同时折叠所有分类
};

// 切换面板内容区域的显示/隐藏状态 (由 panel-header 触发)
const togglePanel = () => {
  isMinimized.value = !isMinimized.value;
  if (isMinimized.value) {
    expandedCategory.value = null; // 收起时折叠所有分类
  }
};

// --- 生命周期与监听 ---
onMounted(async () => {
  loading.value = true;
  try {
    const res = await getRecommendedQuestions();
    categories.value = res.data;
  } catch (error) {
    console.error('获取推荐问题失败:', error);
    categories.value = [{
      title: "常见问题", 
      icon: "QuestionFilled", 
      questions: [
        { text: "园区主要有哪些产业方向？", query: null },
        { text: "如何联系园区管委会相关部门？", query: null }
      ]
    }];
  } finally {
    loading.value = false;
    initialLoadDone.value = true;

    // 初始状态判断：如果加载完成时已经有消息，则默认收起内容区域
    if (props.hasMessages) {
      isMinimized.value = true;
    }
  }
});

// 监听 props.hasMessages 的变化
watch(() => props.hasMessages, (newValue, oldValue) => {
  // 仅在初始加载完成后执行
  if (!initialLoadDone.value) return;

  // 当首次出现消息时 (从 false 变为 true)，并且当前是展开状态，则自动收起内容区域
  if (newValue && !oldValue && !isMinimized.value) {
    isMinimized.value = true;
    expandedCategory.value = null; // 同时折叠所有分类
  }
});

</script>

<style scoped>
.welcome-panel {
  background-color: #fff;
  border-radius: 12px;
  border: 1px solid #e5e7eb;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  position: relative;
  /* 作为绝对定位内容区的基准 */
  width: 100%;
  max-width: 800px;
  box-sizing: border-box;
  z-index: 10;
}

/* 固定的头部区域 - 新增 Flex 布局 */
.panel-header {
  display: flex;
  /* 使用 Flex 布局 */
  flex-direction: column;
  /* 垂直排列 */
  align-items: center;
  /* 水平居中 */
  padding: 10px 12px 5px;
  /* 调整内边距，底部留少许空间给图标 */
  /* height: 50px; */
  /* 移除固定高度，让内容自适应 */
  min-height: 50px;
  /* 保留最小高度 */
  box-sizing: border-box;
  position: relative;
  background-color: #fff;
  border-radius: 12px 12px 0 0;
  border-bottom: 1px solid #f3f4f6;
  z-index: 11;
  cursor: pointer;
  /* 表明整个头部可点击 */
  transition: background-color 0.2s;
  /* 添加悬停效果 */
}

.panel-header:hover {
  background-color: #f9fafb;
  /* 轻微背景变化 */
}

.panel-header:focus-visible {
  /* 键盘聚焦时的样式 */
  outline: 2px solid var(--el-color-primary-light-5);
  outline-offset: 1px;
}


.header-content {
  /* flex-grow: 1; */
  /* 在 column 布局中不需要 */
  text-align: center;
  /* 标题居中 */
  /* padding-right: 30px; */
  /* 移除右侧内边距 */
  margin-bottom: 2px;
  /* 标题和图标之间的间距 */
  width: 100%;
  /* 确保宽度撑满以便居中 */
}

.header-content h2 {
  font-size: 16px;
  font-weight: 600;
  color: #1f2937;
  margin: 0;
  line-height: 1.3;
  /* 调整行高 */
}

/* 新增: 头部下方的切换图标样式 */
.header-toggle-icon {
  font-size: 16px;
  /* 图标大小 */
  color: #9ca3af;
  /* 图标颜色 */
  /* margin-top: 4px; */
  /* 图标与上方内容的间距 */
  transition: color 0.2s;
  /* 颜色过渡 */
}

/* 鼠标悬停在 header 上时，图标颜色也变化 (可选) */
.panel-header:hover .header-toggle-icon {
  color: #6b7280;
}

/* 可折叠的内容区域 - 专注于高度变化 */
.panel-collapsible-content {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background-color: #fff;
  border: 1px solid #e5e7eb;
  border-top: none;
  border-radius: 0 0 12px 12px;
  box-shadow: 0 8px 16px rgba(0, 0, 0, 0.1);
  padding: 12px 16px 16px;
  box-sizing: border-box;
  z-index: 10;
  max-height: calc(70vh - 60px);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  transform-origin: top center;
  transition: max-height 0.8s cubic-bezier(0.4, 0, 0.2, 1),
    transform 0.8s cubic-bezier(0.4, 0, 0.2, 1),
    padding 0.8s cubic-bezier(0.4, 0, 0.2, 1),
    margin 0.8s cubic-bezier(0.4, 0, 0.2, 1),
    border-width 0.8s cubic-bezier(0.4, 0, 0.2, 1);
}

/* 内容区的提示文字 - 保持不变 */
.content-prompt {
  color: #6b7280;
  font-size: 13px;
  margin-bottom: 12px;
  text-align: center;
  flex-shrink: 0;
}

/* 分类列表外部包裹器 - 保持不变 */
.categories-wrapper {
  flex-grow: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* 加载指示器 - 保持不变 */
.loading-container {
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 20px 0;
  color: #6b7280;
  font-size: 14px;
}

.loading-indicator {
  display: flex;
  align-items: center;
  margin-bottom: 10px;
}

.loading-indicator .dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  margin: 0 3px;
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

@keyframes loading-pulse {

  0%,
  80%,
  100% {
    transform: scale(0.7);
    opacity: 0.6;
  }

  40% {
    transform: scale(1);
    opacity: 1;
  }
}


/* 分类容器 - 保持不变 */
.categories-container {
  flex-grow: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-right: 5px;
  /* 为滚动条留空间 */
  margin-right: -5px;
  /* 抵消 padding */
}

.categories-container::-webkit-scrollbar {
  width: 5px;
}

.categories-container::-webkit-scrollbar-thumb {
  background: #d1d5db;
  border-radius: 3px;
}

.categories-container::-webkit-scrollbar-track {
  background: transparent;
}

/* 分类卡片 - 保持不变 */
.category-card {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  overflow: hidden;
  background-color: #fff;
  transition: box-shadow 0.2s ease;
  flex-shrink: 0;
}

.category-card.expanded {
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.06);
}

/* 分类标题 - 新增 .stop 修饰符 */
.category-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  cursor: pointer;
  transition: background-color 0.2s;
  user-select: none;
}

/* 注意: 点击分类标题时，需要阻止事件冒泡到 panel-header, 所以在模板中加了 @click.stop */
.category-card:not(.expanded) .category-header:hover {
  background-color: #f9fafb;
}

.category-title {
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
}

.category-title .el-icon {
  font-size: 16px;
  margin-right: 8px;
  color: var(--el-color-primary);
  flex-shrink: 0;
}

.category-title h3 {
  font-size: 14px;
  font-weight: 600;
  color: #374151;
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.expand-icon {
  font-size: 12px;
  color: #9ca3af;
  transition: transform 0.3s ease-out;
  margin-left: 10px;
  flex-shrink: 0;
}

.expand-icon.is-expanded {
  transform: rotate(180deg);
}

/* 问题列表 - 保持不变 */
.questions-list {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 0.3s ease-in-out;
  overflow: hidden;
  background-color: #ffffff;
}

.category-card.expanded .questions-list {
  grid-template-rows: 1fr;
}

.questions-list>div {
  padding: 5px 5px 8px;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: #e0e0e0 transparent;
}

.questions-list>div::-webkit-scrollbar {
  width: 4px;
}

.questions-list>div::-webkit-scrollbar-thumb {
  background: #e0e0e0;
  border-radius: 2px;
}

/* 问题项 - 保持不变 */
.question-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 10px;
  margin: 2px 0;
  border-radius: 6px;
  cursor: pointer;
  transition: background-color 0.2s, color 0.2s;
  color: #4b5563;
  font-size: 13px;
  overflow: hidden;
}

.question-item span {
  flex-grow: 1;
  margin-right: 8px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.question-item:hover {
  background-color: #f3f4f6;
  color: #1f2937;
}

.question-item .el-icon {
  font-size: 12px;
  opacity: 0;
  transition: opacity 0.2s, transform 0.2s;
  flex-shrink: 0;
}

.question-item:hover .el-icon {
  opacity: 1;
  transform: translateX(3px);
}

/* 过渡动画 - 优化放大和缩小效果 */
.slide-fade-enter-active {
  transition: all 0.95s cubic-bezier(0.16, 1, 0.3, 1);
  /* 更强的先快后慢曲线 */
  transform-origin: top center;
  max-height: 70vh;
  margin-top: 0;
  padding: 12px 16px 16px;
  border-width: 1px;
  opacity: 1;
  overflow: hidden;
}

.slide-fade-leave-active {
  transition: all 0.8s cubic-bezier(0.25, 0.1, 0.25, 1);
  transform-origin: top center;
  max-height: 0;
  margin-top: 0;
  padding-top: 0;
  padding-bottom: 0;
  border-width: 0;
  overflow: hidden;
}

.slide-fade-enter-from,
.slide-fade-leave-to {
  transform: translateY(-15px) scale(0.96);
  max-height: 0;
  padding: 0;
  margin: 0;
  opacity: 0.9;
}
</style>
