import { ElMessage } from 'element-plus';

/**
 * 复制文本到剪贴板
 * 优先使用现代 Clipboard API，回退到 execCommand 方法
 */
export async function copyToClipboard(content: string): Promise<boolean> {
  try {
    // 优先使用现代 Clipboard API
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(content);
      ElMessage.success('已复制到剪贴板！');
      return true;
    }
    
    // 回退方法：创建临时元素并使用 execCommand
    const textArea = document.createElement('textarea');
    textArea.value = content;
    
    // 确保元素在屏幕外且不可见
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    
    // 保存当前选择范围以便恢复
    const savedSelection = document.getSelection()?.rangeCount > 0 
      ? document.getSelection()?.getRangeAt(0)
      : null;
    
    textArea.focus();
    textArea.select();
    
    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    
    // 恢复用户之前的选择
    if (savedSelection) {
      const selection = document.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(savedSelection);
    }
    
    if (successful) {
      ElMessage.success('已复制到剪贴板！');
      return true;
    } else {
      throw new Error('复制操作失败');
    }
  } catch (error) {
    console.error('复制失败:', error);
    ElMessage.error('复制失败，请检查浏览器权限');
    return false;
  }
}