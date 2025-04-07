<template>
  <!-- 
    根元素:
    - 不再有 v-show 控制最终隐藏
    - :class="{ 'is-minimized': isMinimized }": 动态类名
  -->
  <div class="welcome-panel" :class="{ 'is-minimized': isMinimized }">
    <!-- 最小化按钮 (仅在展开状态显示) -->
    <el-tooltip content="收起推荐问题" placement="bottom" :enterable="false">
      <button v-if="!isMinimized" class="minimize-btn" @click.stop="minimizePanel" aria-label="收起推荐问题">
        <el-icon>
          <Minus />
        </el-icon>
      </button>
    </el-tooltip>

    <!-- 主要内容区域 (使用 v-show 以配合 CSS 过渡) -->
    <div class="panel-content" v-show="!isMinimized && showContent">
      <div class="welcome-header">
        <h2>您好,我是牛小助园区智能问答助手</h2>
        <p>您可以直接提问，或从以下常见问题分类中选择：</p>
      </div>

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
          <div class="category-header" @click="toggleCategory(index)">
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

          <!-- 问题列表 - 使用 v-show 配合展开/折叠动画 -->
          <div v-show="expandedCategory === index" class="questions-list">
            <div v-for="(question, qIndex) in category.questions" :key="qIndex" @click="handleQuestionSelect(question)"
              class="question-item">
              <span>{{ question.text }}</span>
              <el-icon>
                <ArrowRight />
              </el-icon>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 恢复指示器 (仅在最小化状态显示) -->
    <div class="restore-indicator" v-if="isMinimized" @click.stop="restorePanel" role="button" aria-label="展开推荐问题">
      <el-tooltip content="展开推荐问题" placement="right" :enterable="false">
        <!-- 图标居中 -->
        <el-icon>
          <ChatDotRound />
        </el-icon>
      </el-tooltip>
    </div>

  </div>
</template>

<script setup lang="ts">
  import { ref, onMounted, nextTick, watch } from 'vue';
  import { ElIcon, ElTooltip } from 'element-plus';
  import {
    ArrowRight, ArrowDown, Minus, ChatDotRound,
    Document, OfficeBuilding, Calendar, Service, QuestionFilled
  } from '@element-plus/icons-vue';

  // 图标映射
  const icons: Record<string, any> = { Document, OfficeBuilding, Calendar, Service, QuestionFilled };

  // --- 类型定义 ---
  interface SubQuestion { text: string; query?: string; }
  interface QuestionCategory { title: string; icon?: string; description?: string; questions: SubQuestion[]; }

  // --- Props ---
  const props = defineProps<{
    hasMessages: boolean; // 由父组件传入
  }>();

  // --- Emits ---
  const emit = defineEmits<{
    (e: 'select-question', questionText: string): void;
    (e: 'update:minimized', value: boolean): void; // 新增：通知父组件最小化状态
  }>();

  // --- 内部状态 ---
  const loading = ref(true);
  const categories = ref<QuestionCategory[]>([]);
  const expandedCategory = ref<number | null>(null);
  const isMinimized = ref(false);    // 控制面板视觉状态
  const showContent = ref(true);     // 控制内容显隐，配合动画
  const initialLoadDone = ref(false); // 标记初始加载是否完成

  // --- 方法 ---

  // 切换分类展开状态
  const toggleCategory = (index: number) => {
    expandedCategory.value = expandedCategory.value === index ? null : index;
  };

  // 处理问题选择 - 触发最小化并发送事件
  const handleQuestionSelect = (question: SubQuestion) => {
    minimizePanel(); // <--- 触发最小化
    const queryText = question.query || question.text;
    emit('select-question', queryText); // <--- 发送事件给父组件
  };

  // 最小化面板函数
  const minimizePanel = async () => {
    if (isMinimized.value) return;

    showContent.value = false;
    expandedCategory.value = null;
    await nextTick(); // 等待 DOM 更新（v-show 生效）
    isMinimized.value = true;
    emit('update:minimized', true); // 通知父组件
  };

  // 恢复面板函数
  const restorePanel = async () => {
    // 只有在最小化状态下才能恢复
    if (!isMinimized.value) return;
    // 如果父组件告知有消息，不允许手动恢复展开（它应该保持最小化）
    if (props.hasMessages) {
      console.log("Cannot expand panel when messages exist.");
      return;
    }

    isMinimized.value = false;
    emit('update:minimized', false); // 通知父组件
    await nextTick(); // 等待 DOM 更新（is-minimized 类移除）
    // 动画开始后显示内容
    showContent.value = true;
  };

  // 模拟 API 请求获取推荐问题
  const fetchRecommendedQuestions = async (): Promise<QuestionCategory[]> => {
    await new Promise(resolve => setTimeout(resolve, 600));
    return [ /* ... 问题数据保持不变 ... */
      { title: "园区政策咨询", icon: "Document", questions: [{ text: "园区有哪些优惠政策?" }, { text: "如何申请创业补贴?" }, { text: "园区税收政策有哪些特点?" }, { text: "高新企业认定条件是什么?" }] },
      { title: "园区企业前置审核事项办事指南", icon: "OfficeBuilding", questions: [{ text: "新设立企业入驻园区审核材料?" }, { text: "营业执照信息变更审核材料?" }, { text: "前置审核线下办理地址?" }, { text: "入园流程有哪些?" }] },
      { title: "活动与培训", icon: "Calendar", questions: [{ text: "近期有哪些创业沙龙活动?" }, { text: "如何报名参加园区培训?" }, { text: "投资对接会什么时候举办?" }, { text: "创业导师咨询如何预约?" }] },
      { title: "设施与服务", icon: "Service", questions: [{ text: "园区餐饮设施在哪里?" }, { text: "会议室预订方式?" }, { text: "园区交通出行指南?" }, { text: "健身与休闲场所开放时间?" }] }
    ];
  };

  // --- 生命周期与监听 ---
  onMounted(async () => {
    loading.value = true;
    try {
      categories.value = await fetchRecommendedQuestions();
    } catch (error) {
      console.error('获取推荐问题失败:', error);
      categories.value = [{ title: "常见问题", icon: "QuestionFilled", questions: [{ text: "园区有哪些政策?" }, { text: "如何申请入驻园区?" }] }];
    } finally {
      loading.value = false;
      initialLoadDone.value = true; // 标记加载完成
      // 初始状态判断：如果加载完成时已经有消息，则直接进入最小化状态
      if (props.hasMessages) {
        minimizePanel(); // 直接调用最小化，它会emit状态
      }
    }
  });

  // 监听 props.hasMessages 的变化
  watch(() => props.hasMessages, (newValue, oldValue) => {
    // 确保初始加载完成后再响应
    if (!initialLoadDone.value) return;

    if (newValue === true && oldValue === false) {
      // 当有消息出现时，如果当前不是最小化，则最小化
      if (!isMinimized.value) {
        minimizePanel();
      }
    } else if (newValue === false && oldValue === true) {
      // 当消息被清空时，恢复展开状态
      if (isMinimized.value) {
        restorePanel();
      }
    }
  });

</script>

<style scoped>

  /* --- 根面板样式 --- */
  .welcome-panel {
    background-color: #fff;
    border-radius: 12px;
    padding: 16px;
    /* 移除 margin-bottom，由父组件控制布局 */
    /* margin-bottom: 20px; */
    border: 1px solid #e5e7eb;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
    position: relative;
    /* 保持相对定位，以便子元素定位 */
    overflow: hidden;
    /* 移除 position/display 相关过渡，由父组件控制 */
    transition: width 0.4s cubic-bezier(0.4, 0, 0.2, 1),
      height 0.4s cubic-bezier(0.4, 0, 0.2, 1),
      padding 0.4s cubic-bezier(0.4, 0, 0.2, 1),
      opacity 0.3s ease;
    width: 100%;
    /* 展开时的宽度 */
    max-height: 80vh;
    opacity: 1;
    box-sizing: border-box;
    /* 包含 padding 和 border */
    transform: translateZ(0);
  }

  /* --- 最小化状态 --- */
  .welcome-panel.is-minimized {
    width: 44px;
    height: 44px;
    padding: 0;
    cursor: pointer;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);
    /* 最小化时不再有 margin */
    margin: 0;
  }

  /* --- 最小化按钮 --- */
  .minimize-btn {
    /* ... 样式保持不变 ... */
    position: absolute;
    top: 6px;
    right: 6px;
    z-index: 20;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background-color: transparent;
    border: none;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    color: #9ca3af;
    transition: background-color 0.2s, color 0.2s;
  }

  .minimize-btn .el-icon {
    font-size: 16px;
  }

  .minimize-btn:hover {
    background-color: #f3f4f6;
    color: #6b7280;
  }

  .minimize-btn:focus {
    outline: none;
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.4);
  }

  /* --- 主要内容容器 --- */
  .panel-content {
    /* ... 样式保持不变 ... */
    transition: opacity 0.2s ease-out;
    opacity: 1;
    height: auto;
    overflow: hidden;
  }

  .welcome-panel.is-minimized .panel-content {
    opacity: 0;
    pointer-events: none;
    visibility: hidden;
  }

  /* --- 恢复指示器 (样式调整 - 居中) --- */
  .restore-indicator {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    /* 垂直居中 */
    justify-content: center;
    /* 水平居中 */
    /* 移除 padding */
    /* padding: 8px; */
    box-sizing: border-box;
    color: var(--el-color-primary);
    font-size: 20px;
    /* 图标大小 */
    transition: opacity 0.2s ease-in;
    opacity: 1;
  }

  .restore-indicator .el-icon {
    transition: transform 0.2s ease;
  }

  .restore-indicator:hover .el-icon {
    transform: scale(1.15);
  }

  .welcome-panel:not(.is-minimized) .restore-indicator {
    opacity: 0;
    pointer-events: none;
    visibility: hidden;
  }


  /* --- Header, Loading, Categories 等样式保持不变 --- */
  /* ... (省略未改变的样式, 确保移除 WelcomePanel 的 margin-bottom) ... */
  .welcome-header {
    text-align: center;
    margin-bottom: 16px;
    padding-right: 30px;
  }

  .welcome-header h2 {
    font-size: 18px;
    font-weight: 600;
    color: #1f2937;
    margin-bottom: 6px;
  }

  .welcome-header p {
    color: #6b7280;
    font-size: 14px;
    margin-bottom: 0;
    line-height: 1.5;
  }

  .loading-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 30px 0;
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

  .categories-container {
    display: flex;
    flex-direction: column;
    gap: 10px;
    max-height: calc(80vh - 150px);
    overflow-y: auto;
    padding-right: 5px;
    margin-top: 10px;
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

  .category-card {
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    overflow: hidden;
    /* background-color: #f9fafb; */
    background-color: #fff;
    transition: box-shadow 0.2s ease, background-color 0.2s ease;
  }

  .category-card.expanded {
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.06);
    background-color: #fff;
  }

  .category-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 15px;
    cursor: pointer;
    transition: background-color 0.2s;
  }

  .category-card:not(.expanded) .category-header:hover {
    background-color: #f3f4f6;
  }

  .category-title {
    display: flex;
    align-items: center;
    flex: 1;
    min-width: 0;
  }

  .category-title .el-icon {
    font-size: 18px;
    margin-right: 10px;
    color: var(--el-color-primary);
    /* color: #4b5563; */
    flex-shrink: 0;
  }

  .category-title h3 {
    font-size: 15px;
    font-weight: 600;
    color: #374151;
    margin: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .expand-icon {
    font-size: 14px;
    color: #9ca3af;
    transition: transform 0.3s ease-out;
    margin-left: 10px;
    flex-shrink: 0;
  }

  .expand-icon.is-expanded {
    transform: rotate(180deg);
  }

  .questions-list {
    background-color: #ffffff;
    transition: max-height 0.35s ease-in-out, padding 0.35s ease-in-out, opacity 0.3s ease-in-out;
    max-height: 0;
    opacity: 0;
    overflow: hidden;
    padding: 0 5px;
  }

  .category-card.expanded .questions-list {
    max-height: 250px;
    opacity: 1;
    padding: 5px 5px;
    overflow-y: auto;
  }

  .questions-list::-webkit-scrollbar {
    width: 4px;
  }

  .questions-list::-webkit-scrollbar-thumb {
    background: #e0e0e0;
    border-radius: 2px;
  }

  .question-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 10px;
    margin: 2px 0;
    border-radius: 6px;
    cursor: pointer;
    transition: background-color 0.2s, color 0.2s;
    color: #4b5563;
    font-size: 14px;
  }

  .question-item span {
    flex-grow: 1;
    margin-right: 10px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .question-item:hover {
    background-color: #f3f4f6;
    color: #1f2937;
  }

  .question-item .el-icon {
    font-size: 14px;
    opacity: 0;
    transition: opacity 0.2s, transform 0.2s;
    flex-shrink: 0;
  }

  .question-item:hover .el-icon {
    opacity: 1;
    transform: translateX(3px);
  }

</style>