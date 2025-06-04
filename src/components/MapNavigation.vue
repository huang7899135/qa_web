<template>
    <div class="map-launcher-container">
      <!-- 显示目的地信息 -->
      <div class="destination-display">
        导航至: {{ effectiveDestinationName }}
        <div class="coordinates">
          (纬度: {{ effectiveLat.toFixed(6) }}, 经度: {{ effectiveLng.toFixed(6) }})
        </div>
      </div>
  
      <div class="map-buttons">
        <!-- 高德地图按钮 -->
        <button @click="launchGaodeMap" class="map-button gaode">
          <img src="https://webapi.amap.com/theme/v1.3/favicon.ico" alt="高德图标" class="map-icon" />
          高德地图导航
        </button>
  
        <!-- 百度地图按钮 -->
        <button @click="launchBaiduMap" class="map-button baidu">
          <img src="https://map.baidu.com/favicon.ico" alt="百度图标" class="map-icon" />
          百度地图导航
        </button>
      </div>
  
      <!-- 提示信息 -->
      <div v-if="showTip" class="info-message tip">
        正在尝试打开地图应用... 如果长时间无反应，请确保已安装对应的App。
      </div>
      <div v-if="error" class="info-message error">
        发生错误: {{ error }}
      </div>
    </div>
  </template>
  
  <script lang="ts">
  import { defineComponent, ref, computed, type PropType } from 'vue';
  
  // 成都天府广场坐标 (GCJ02)
  const DEFAULT_LAT = 104.10;
  const DEFAULT_LNG = 30.77;
  const DEFAULT_NAME = '西部地理信息科技产业园7栋';
  
  export default defineComponent({
    name: 'MapNavigationLauncherRefactored',
    props: {
      // 目的地纬度 (可选, 有默认值)
      destinationLat: {
        type: Number as PropType<number | null>,
        default: null, // 稍后在 computed 中处理默认值
      },
      // 目的地经度 (可选, 有默认值)
      destinationLng: {
        type: Number as PropType<number | null>,
        default: null, // 稍后在 computed 中处理默认值
      },
      // 目的地名称 (可选, 有默认值)
      destinationName: {
        type: String as PropType<string | null>,
        default: null, // 稍后在 computed 中处理默认值
      },
      // 调用来源名称 (可选, 用于地图App的来源标识)
      sourceApplication: {
        type: String,
        default: 'WebApp', // 默认来源名称
      }
    },
    setup(props) {
      const error = ref<string | null>(null);
      const showTip = ref(false); // 用于显示尝试打开的提示
  
      // --- 计算有效的目的地信息 (处理默认值) ---
      const effectiveLat = computed(() => props.destinationLat ?? DEFAULT_LAT);
      const effectiveLng = computed(() => props.destinationLng ?? DEFAULT_LNG);
      const effectiveDestinationName = computed(() => props.destinationName ?? DEFAULT_NAME);
  
      // --- 辅助函数：检测操作系统 (可能影响src参数格式或特定链接) ---
      // 虽然 Universal/App Links 目标是跨平台，但有时细节有差异
      const getPlatform = (): 'ios' | 'android' | 'other' => {
        const u = navigator.userAgent;
        if (!!u.match(/\(i[^;]+;( U;)? CPU.+Mac OS X/)) {
          return 'ios';
        }
        if (u.indexOf('Android') > -1 || u.indexOf('Adr') > -1) {
          return 'android';
        }
        return 'other';
      };
      const platform = getPlatform();
  
      // --- 核心功能：构建并尝试打开地图 App 的 Universal/App Link ---
      const openMapUrl = (url: string) => {
        error.value = null; // 清除旧错误
        showTip.value = true; // 显示提示信息
        // console.log(`尝试打开地图 Universal/App Link: ${url}`);
  
        try {
          // 使用 a 标签的 click 方法有时比直接设置 location.href 更可靠
          // 特别是在某些 webview 或浏览器环境下，可以更好地触发 app link 机制
          const link = document.createElement('a');
          link.href = url;
          // link.target = '_blank'; // 在新标签页打开网页版 fallback (如果需要)
          document.body.appendChild(link); // 需要添加到DOM中才能模拟点击
          link.click();
          document.body.removeChild(link); // 清理
  
          // 短暂延迟后隐藏提示 (如果app启动成功，用户通常看不到)
          setTimeout(() => {
            showTip.value = false;
          }, 2500);
  
        } catch (e: any) {
          // console.error("打开地图 URL 时出错:", e);
          error.value = `尝试打开地图失败: ${e.message}. 请检查浏览器设置或权限。`;
          showTip.value = false; // 出错时隐藏提示
        }
      };
  
      // --- 启动各大地图 App ---
  
      // 启动高德地图导航 (使用 uri.amap.com)
      const launchGaodeMap = () => {
        const lat = effectiveLat.value;
        const lon = effectiveLng.value;
        const name = encodeURIComponent(effectiveDestinationName.value);
        const sourceApp = encodeURIComponent(props.sourceApplication);
        // 高德Web API文档: https://lbs.amap.com/api/uri/guide/mobile-uri/navigation
        // to=lon,lat,name (注意经纬度顺序)
        // mode=car/bus/walk/ride
        // policy= 可选驾车策略 (0-11)
        // src= 来源名称
        // coordinate=gcj02 (默认通常是gcj02，可不写)
        const url = `https://uri.amap.com/navigation?to=${lon},${lat},${name}&mode=car&src=${sourceApp}`;
        openMapUrl(url);
      };
  
      // 启动百度地图导航 (使用 map.baidu.com)
      const launchBaiduMap = () => {
        const lat = effectiveLat.value;
        const lon = effectiveLng.value;
        const name = encodeURIComponent(effectiveDestinationName.value);
        const sourceApp = encodeURIComponent(props.sourceApplication);
        // 百度地图 Web API 文档: https://lbsyun.baidu.com/index.php?title=uri/api/web
        // destination=lat,lon / name:名称 / latlng:lat,lon|name:名称
        // coord_type=gcj02/bd09ll/wgs84 (指明输入坐标系，非常重要！)
        // mode=driving/walking/riding/transit
        // origin=我的位置 (让App自动获取起点)
        // src= 平台标识.公司名.应用名 (例如: webapp.yourcompany.yourapp)
        const platformSrc = platform === 'ios' ? 'ios' : (platform === 'android' ? 'andr' : 'web');
        const fullSrc = `${platformSrc}.${sourceApp}.navigation`;
        // 使用 latlng:lat,lon|name:NAME 格式的 destination
        const destinationParam = `latlng:${lat},${lon}|name:${name}`;
        const url = `https://map.baidu.com/direction?origin=我的位置&destination=${destinationParam}&mode=driving&coord_type=gcj02&src=${fullSrc}`;
        openMapUrl(url);
      };
  
      // 启动腾讯地图导航 (使用 https://apis.map.qq.com/uri/v1/routeplan) (可选)
      // const launchTencentMap = () => {
      //   const lat = effectiveLat.value;
      //   const lon = effectiveLng.value;
      //   const name = encodeURIComponent(effectiveDestinationName.value);
      //   const sourceApp = encodeURIComponent(props.sourceApplication);
      //   // 腾讯地图文档: https://lbs.qq.com/uri/uri_v1/guide-mobile-routeplan.html
      //   // type=drive/bus/walk/bike
      //   // to=名称 // 可选，目的地名称
      //   // tocoord=纬度,经度
      //   // policy= 可选策略
      //   // referer= 你申请的腾讯地图key (非常重要！)
      //   const tencentKey = 'YOUR_TENCENT_MAP_KEY'; // 替换为你的腾讯地图Key
      //   if (tencentKey === 'YOUR_TENCENT_MAP_KEY') {
      //       error.value = "请先设置腾讯地图 Key (referer)";
      //       return;
      //   }
      //   const url = `https://apis.map.qq.com/uri/v1/routeplan?type=drive&to=${name}&tocoord=${lat},${lon}&policy=0&referer=${tencentKey}`;
      //   openMapUrl(url);
      // };
  
      return {
        effectiveLat,
        effectiveLng,
        effectiveDestinationName,
        error,
        showTip,
        launchGaodeMap,
        launchBaiduMap,
        // launchTencentMap, // 如果添加了腾讯地图，暴露它
      };
    }
  });
  </script>
  
  <style scoped>
  .map-launcher-container {
    padding: 20px; /* 增加内边距 */
    border: 1px solid #e0e0e0;
    border-radius: 10px; /* 更圆的角 */
    max-width: 400px; /* 限制最大宽度 */
    margin: 25px auto;
    background-color: #ffffff; /* 白色背景 */
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08); /* 添加细微阴影 */
    text-align: center;
    font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; /* 使用更现代的字体 */
  }
  
  .destination-display {
    margin-bottom: 25px; /* 增加与按钮的间距 */
    font-size: 16px; /* 稍大字体 */
    color: #333;
    line-height: 1.5; /* 增加行高 */
  }
  
  .coordinates {
    font-size: 13px; /* 坐标字体小一点 */
    color: #666; /* 坐标颜色浅一点 */
    margin-top: 5px;
  }
  
  .map-buttons {
    display: flex;
    flex-direction: column;
    gap: 15px; /* 增加按钮间距 */
    align-items: center;
  }
  
  .map-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 12px 25px; /* 增加按钮内边距 */
    border: none;
    border-radius: 8px; /* 更圆的按钮角 */
    color: white;
    font-size: 16px;
    font-weight: 500; /* 字体稍粗 */
    cursor: pointer;
    transition: background-color 0.2s ease, transform 0.1s ease; /* 平滑过渡 */
    width: 90%; /* 按钮宽度 */
    min-height: 48px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.1); /* 按钮轻微阴影 */
  }
  
  .map-button:active {
      transform: scale(0.98); /* 点击时轻微缩小 */
  }
  
  .map-button:disabled {
    background-color: #bdbdbd;
    cursor: not-allowed;
    opacity: 0.7;
    box-shadow: none;
  }
  
  .map-button.gaode {
    background-color: #1284ff; /* 新的高德蓝 */
  }
  .map-button.gaode:not(:disabled):hover {
    background-color: #0a6dd9;
  }
  
  .map-button.baidu {
    background-color: #3072f6; /* 百度Logo蓝 */
  }
  .map-button.baidu:not(:disabled):hover {
    background-color: #255ecc;
  }
  
  /* 如果添加腾讯地图 */
  .map-button.tencent {
    background-color: #007bff; /* 腾讯地图常用蓝色 */
  }
  .map-button.tencent:not(:disabled):hover {
    background-color: #0056b3;
  }
  
  
  .map-icon {
    width: 22px; /* 图标稍大 */
    height: 22px;
    margin-right: 10px; /* 图标与文字间距 */
  }
  
  .info-message {
    margin-top: 20px; /* 与按钮的间距 */
    padding: 10px 15px;
    border-radius: 6px;
    font-size: 14px;
    text-align: left;
  }
  
  .info-message.error {
    color: #d32f2f;
    background-color: #ffebee;
    border: 1px solid #ffcdd2;
  }
  
  .info-message.tip {
    color: #1976d2; /* 提示信息蓝色 */
    background-color: #e3f2fd; /* 提示信息淡蓝色背景 */
    border: 1px solid #bbdefb; /* 提示信息边框 */
  }
  </style>