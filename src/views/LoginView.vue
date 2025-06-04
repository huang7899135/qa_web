<template>
    <div class="login-page">
        <div v-if="retryLimitReached">
            <p class="error-message">登录尝试次数过多，请稍后再试</p>
            <p class="error-message">如果问题持续存在，请联系技术支持</p>
            <button @click="refreshPage" class="retry-button">
                刷新页面重试
            </button>
        </div>
        <div v-else-if="isWeChat">
            <p>正在跳转到微信进行授权...</p>
            <!-- 可选：添加一个加载指示器 -->
            <div class="loader" v-if="!redirectTimedOut"></div>
            <p v-if="redirectTimedOut" class="error-message">
                授权跳转似乎遇到了问题。请检查您的网络连接，或尝试刷新页面重新登录。
            </p>
        </div>
        <p v-else class="error-message">请在微信浏览器内访问</p>
    </div>
</template>

<script setup lang="ts">
import { onMounted, ref, onUnmounted } from 'vue';
import { isWechatBrowser, getLoginRetryCount } from '@/utils/auth';

const isWeChat = ref(false);
const redirectTimedOut = ref(false); // 新增：跟踪跳转是否超时
const retryLimitReached = ref(false); // 新增：跟踪是否达到重试上限
let redirectTimer: number | null = null; // 新增：用于存储定时器 ID

// 刷新页面函数
const refreshPage = () => {
    window.location.reload();
};

onMounted(() => {
    // 检查重试次数
    const retryCount = getLoginRetryCount();
    if (retryCount >= 3) {
        retryLimitReached.value = true;
        isWeChat.value = true; // 显示微信环境检测通过但重试次数过多的信息
        return;
    }

    // 清理可能存在的旧定时器（以防组件意外重载）
    if (redirectTimer) {
        clearTimeout(redirectTimer);
        redirectTimer = null;
    }

    if (isWechatBrowser()) {
        isWeChat.value = true;
        redirectTimedOut.value = false; // 重置超时状态
        
        // 获取当前路径作为重定向目标
        const originalPath = sessionStorage.getItem('redirectPath') || window.location.pathname || '/';
        
        // 构造后端登录URL
        const backendBaseUrl = import.meta.env.VITE_API_BASE_URL || '';
        const loginUrl = `${backendBaseUrl}/wechat/auth/base/login?redirect=${encodeURIComponent(originalPath)}`;

        // console.log('Redirecting to backend login:', loginUrl);

        // 设置超时定时器 (例如 5 秒)
        redirectTimer = window.setTimeout(() => {
            console.warn('Backend login redirection timed out.');
            redirectTimedOut.value = true; // 标记为超时
            // 此时用户仍在当前页面，显示超时错误信息
        }, 5000); // 5000 毫秒 = 5 秒

        // 尝试执行跳转到后端登录端点
        try {
            window.location.href = loginUrl;
            // 如果跳转立即成功或即将开始，定时器将在页面卸载时自动清理，
            // 或者如果跳转被浏览器阻止，定时器会触发。
        } catch (error) {
            // console.error('Failed to initiate redirection:', error);
            if (redirectTimer) clearTimeout(redirectTimer); // 出错时清除定时器
            redirectTimedOut.value = true; // 直接标记为失败
            isWeChat.value = true; // 保持显示微信环境下的错误信息
        }

    } else {
        isWeChat.value = false;
        console.warn('Not in WeChat browser.');
    }
});

// 可选：在组件卸载时也清理定时器
onUnmounted(() => {
    if (redirectTimer) {
        clearTimeout(redirectTimer);
    }
});

</script>

<style scoped>
.login-page {
    display: flex;
    flex-direction: column; /* 允许多行内容垂直排列 */
    justify-content: center;
    align-items: center;
    height: 100vh;
    font-size: 1.2em;
    text-align: center;
    padding: 20px; /* 添加一些内边距 */
}
.error-message {
    color: red;
    margin-top: 10px; /* 与上方内容隔开 */
}

.retry-button {
    margin-top: 20px;
    padding: 10px 20px;
    background-color: #007bff;
    color: white;
    border: none;
    border-radius: 5px;
    cursor: pointer;
    font-size: 14px;
    transition: background-color 0.2s;
}

.retry-button:hover {
    background-color: #0056b3;
}

/* 简单的 CSS 加载指示器 */
.loader {
    border: 4px solid #f3f3f3; /* Light grey */
    border-top: 4px solid #3498db; /* Blue */
    border-radius: 50%;
    width: 30px;
    height: 30px;
    animation: spin 1s linear infinite;
    margin: 15px auto; /* 上下边距和居中 */
}

@keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
}
</style>