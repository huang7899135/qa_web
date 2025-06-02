// 认证相关工具函数

// 登录重试计数器
let loginRetryCount = 0;
const MAX_LOGIN_RETRIES = 3; // 最大重试次数
const RETRY_RESET_INTERVAL = 5 * 60 * 1000; // 5分钟后重置重试计数

// 重置重试计数的定时器
let retryResetTimer: number | null = null;

/**
 * 统一的登录重定向处理
 * @param reason 触发登录的原因（可选）
 * @returns 是否成功处理重定向
 */
export function handleLoginRedirect(reason?: string): boolean {
  // 检查重试次数
  if (loginRetryCount >= MAX_LOGIN_RETRIES) {
    console.error(`登录重试次数已达到上限 (${MAX_LOGIN_RETRIES})，停止重试`);
    
    // 显示错误提示给用户
    if (typeof window !== 'undefined') {
      const message = `登录失败次数过多，请稍后再试。如果问题持续存在，请联系技术支持。`;
      // 这里可以使用你的UI库的提示组件，比如 ElMessage
      alert(message);
    }
    
    return false;
  }

  // 增加重试计数
  loginRetryCount++;
  console.log(`执行登录重定向 (第 ${loginRetryCount} 次)${reason ? `，原因: ${reason}` : ''}`);

  // 清理现有的 token
  localStorage.removeItem('jwt_token');
  
  // 保存当前路径
  if (typeof window !== 'undefined') {
    sessionStorage.setItem('redirectPath', window.location.pathname + window.location.search + window.location.hash);
  }

  // 设置重置定时器
  if (retryResetTimer) {
    clearTimeout(retryResetTimer);
  }
  retryResetTimer = window.setTimeout(() => {
    console.log('重置登录重试计数');
    loginRetryCount = 0;
    retryResetTimer = null;
  }, RETRY_RESET_INTERVAL);

  // 执行重定向到登录页面
  try {
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
    return true;
  } catch (error) {
    console.error('登录重定向失败:', error);
    return false;
  }
}

/**
 * 重置登录重试计数（用于成功登录后）
 */
export function resetLoginRetryCount(): void {
  loginRetryCount = 0;
  if (retryResetTimer) {
    clearTimeout(retryResetTimer);
    retryResetTimer = null;
  }
  console.log('登录重试计数已重置');
}

/**
 * 获取当前重试次数
 */
export function getLoginRetryCount(): number {
  return loginRetryCount;
}

/**
 * 检查是否为微信浏览器
 */
export function isWechatBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent.toLowerCase();
  return /micromessenger/.test(ua);
}
