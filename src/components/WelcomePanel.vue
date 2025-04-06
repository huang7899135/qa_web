<template>
  <div class="welcome-panel" v-if="showPanel">
    <div class="welcome-header">
      <h2>欢迎使用园区智能问答助手</h2>
      <p>您可以直接提问，或从以下常见问题分类中选择：</p>
    </div>
    
    <div v-if="loading" class="loading-container">
      <div class="loading-indicator">
        <span class="dot"></span>
        <span class="dot"></span>
        <span class="dot"></span>
      </div>
      <span>加载推荐问题中...</span>
    </div>
    
    <div v-else class="categories-container">
      <div 
        v-for="(category, index) in categories" 
        :key="category.title" 
        class="category-card"
        :class="{'expanded': expandedCategory === index}"
      >
        <!-- 分类标题栏 - 点击切换展开/折叠 -->
        <div class="category-header" @click="toggleCategory(index)">
          <div class="category-title">
            <el-icon v-if="category.icon"><component :is="category.icon" /></el-icon>
            <h3>{{ category.title }}</h3>
            <span class="category-count">{{ category.questions.length }}个问题</span>
          </div>
          <el-icon class="expand-icon" :class="{'is-expanded': expandedCategory === index}">
            <ArrowDown />
          </el-icon>
        </div>

        <!-- 问题列表 - 仅在选中当前分类时展示 -->
        <div v-show="expandedCategory === index" class="questions-list">
          <p v-if="category.description" class="category-description">{{ category.description }}</p>
          <div 
            v-for="(question, qIndex) in category.questions" 
            :key="qIndex" 
            @click="handleQuestionSelect(question)" 
            class="question-item">
            <span>{{ question.text }}</span>
            <el-icon><ArrowRight /></el-icon>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { ElIcon } from 'element-plus';
import { ArrowRight, ArrowDown } from '@element-plus/icons-vue';

// 类型定义
interface SubQuestion {
  text: string;
  query?: string;
}

interface QuestionCategory {
  title: string;
  icon?: string;
  description?: string;
  questions: SubQuestion[];
}

// Props
const props = defineProps<{
  hasMessages: boolean; // 是否已有消息
}>();

// Emits
const emit = defineEmits<{
  (e: 'select-question', questionText: string): void;
}>();

// 状态
const loading = ref(true);
const categories = ref<QuestionCategory[]>([]);
const expandedCategory = ref<number | null>(null); // 当前展开的分类索引，null 表示都不展开

// 计算属性：是否显示面板
const showPanel = computed(() => !props.hasMessages);

// 切换分类展开状态
const toggleCategory = (index: number) => {
  expandedCategory.value = expandedCategory.value === index ? null : index;
};

// 处理问题选择
const handleQuestionSelect = (question: SubQuestion) => {
  const queryText = question.query || question.text;
  emit('select-question', queryText);
};

// 模拟API请求获取推荐问题
const fetchRecommendedQuestions = async (): Promise<QuestionCategory[]> => {
  // 模拟网络延迟
  await new Promise(resolve => setTimeout(resolve, 600));
  
  // 返回假数据
  return [
    {
      title: "园区政策咨询",
      icon: "Document",
      description: "了解园区最新政策与申请流程",
      questions: [
        { text: "园区有哪些优惠政策?" },
        { text: "如何申请创业补贴?" },
        { text: "园区税收政策有哪些特点?" },
        { text: "高新企业认定条件是什么?" }
      ]
    },
    {
      title: "入驻指南",
      icon: "OfficeBuilding",
      description: "办公空间申请与企业入驻流程",
      questions: [
        { text: "入驻园区需要哪些条件?" },
        { text: "办公室租赁价格是多少?" },
        { text: "申请入驻流程是什么?" },
        { text: "共享办公资源有哪些?" }
      ]
    },
    {
      title: "活动与培训",
      icon: "Calendar",
      description: "园区举办的活动、讲座和培训",
      questions: [
        { text: "近期有哪些创业沙龙活动?" },
        { text: "如何报名参加园区培训?" },
        { text: "投资对接会什么时候举办?" },
        { text: "创业导师咨询如何预约?" }
      ]
    },
    {
      title: "设施与服务",
      icon: "Service",
      description: "园区配套设施与企业服务",
      questions: [
        { text: "园区餐饮设施在哪里?" },
        { text: "会议室预订方式?" },
        { text: "园区交通出行指南?" },
        { text: "健身与休闲场所开放时间?" }
      ]
    }
  ];
};

// 生命周期钩子
onMounted(async () => {
  try {
    categories.value = await fetchRecommendedQuestions();
  } catch (error) {
    console.error('获取推荐问题失败:', error);
    // 加载失败时使用备用数据
    categories.value = [
      {
        title: "常见问题",
        icon: "QuestionFilled",
        questions: [
          { text: "园区有哪些政策?" },
          { text: "如何申请入驻园区?" }
        ]
      }
    ];
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped>
.welcome-panel {
  background-color: #fff;
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 20px;
  animation: fadeIn 0.5s ease;
  /* box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05); */
}

.welcome-header {
  text-align: center;
  margin-bottom: 16px;
}

.welcome-header h2 {
  font-size: 20px;
  color: #1f2937;
  margin-bottom: 6px;
}

.welcome-header p {
  color: #6b7280;
  font-size: 14px;
  margin-bottom: 0;
}

.loading-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 20px 0;
  color: #6b7280;
}

.categories-container {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.category-card {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  overflow: hidden;
  background-color: #f9fafb;
  transition: all 0.2s ease;
}

.category-card.expanded {
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.05);
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
}

.category-title .el-icon {
  font-size: 18px;
  margin-right: 10px;
  color: #4b5563;
}

.category-title h3 {
  font-size: 16px;
  font-weight: 600;
  color: #1f2937;
  margin: 0;
  margin-right: 10px;
}

.category-count {
  font-size: 12px;
  color: #6b7280;
  background: #f3f4f6;
  padding: 2px 8px;
  border-radius: 12px;
}

.expand-icon {
  font-size: 14px;
  color: #9ca3af;
  transition: transform 0.3s;
}

.expand-icon.is-expanded {
  transform: rotate(180deg);
}

.category-description {
  padding: 0 15px 10px;
  margin: 0;
  color: #6b7280;
  font-size: 14px;
  border-bottom: 1px solid #f3f4f6;
}

.questions-list {
  padding: 5px 0;
  background-color: #ffffff;
}

.question-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 15px;
  margin: 0 5px;
  border-radius: 6px;
  cursor: pointer;
  transition: background-color 0.2s;
  color: #4b5563;
}

.question-item:hover {
  background-color: #f3f4f6;
  color: #1f2937;
}

.question-item .el-icon {
  font-size: 14px;
  opacity: 0;
  transition: opacity 0.2s, transform 0.2s;
}

.question-item:hover .el-icon {
  opacity: 1;
  transform: translateX(3px);
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(5px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* 响应式调整 */
@media (max-width: 768px) {
  .welcome-panel {
    padding: 12px;
  }
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

@keyframes loading-pulse {
  0%, 80%, 100% {
    transform: scale(0.7);
    opacity: 0.5;
  }
  40% {
    transform: scale(1);
    opacity: 1;
  }
}
</style>