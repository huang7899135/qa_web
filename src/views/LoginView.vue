<template>
    <div class="login-page">
        <div v-if="isWeChat">
            <p>正在跳转到微信进行授权...</p>
            <!-- 可选：添加一个加载指示器 -->
            <div class="loader" v-if="!redirectTimedOut"></div>
            <p v-if="redirectTimedOut" class="error-message">
                跳转似乎遇到了问题。请检查您的网络连接，或尝试刷新页面。如果问题持续存在，请确保您在微信内部打开此链接。
            </p>
        </div>
        <p v-else class="error-message">请在微信浏览器内访问</p>
    </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';

const APPID = import.meta.env.VITE_WECHAT_APPID as string;
const REDIRECT_URI = import.meta.env.VITE_WECHAT_REDIRECT_URI as string;

const isWeChat = ref(false);
const redirectTimedOut = ref(false); // 新增：跟踪跳转是否超时
let redirectTimer: number | null = null; // 新增：用于存储定时器 ID

function isWechatBrowser(): boolean {
    const ua = navigator.userAgent.toLowerCase();
    return /micromessenger/.test(ua);
}

onMounted(() => {
    // 清理可能存在的旧定时器（以防组件意外重载）
    if (redirectTimer) {
        clearTimeout(redirectTimer);
        redirectTimer = null;
    }

    if (!APPID || !REDIRECT_URI) {
        console.error("错误：未配置微信 APPID 或 REDIRECT_URI 环境变量！");
        isWeChat.value = false;
        // 可以在模板中显示更具体的配置错误信息
        return;
    }

    if (isWechatBrowser()) {
        isWeChat.value = true;
        redirectTimedOut.value = false; // 重置超时状态
        const originalPath = sessionStorage.getItem('redirectPath') || '/'; 
        const stateData = JSON.stringify({ redirect: originalPath });
        const encodedState = encodeURIComponent(stateData);
        const authUrl = `https://open.weixin.qq.com/connect/oauth2/authorize?appid=${APPID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=snsapi_base&state=${encodedState}#wechat_redirect`;

        console.log('Redirecting to WeChat OAuth:', authUrl);

        // 设置超时定时器 (例如 5 秒)
        redirectTimer = window.setTimeout(() => {
            console.warn('WeChat redirection timed out.');
            redirectTimedOut.value = true; // 标记为超时
            // 此时用户仍在当前页面，显示超时错误信息
        }, 5000); // 5000 毫秒 = 5 秒

        // 尝试执行跳转
        try {
            window.location.href = authUrl;
            // 如果跳转立即成功或即将开始，定时器将在页面卸载时自动清理，
            // 或者如果跳转被浏览器阻止，定时器会触发。
        } catch (error) {
            console.error('Failed to initiate redirection:', error);
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
import { onUnmounted } from 'vue';
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