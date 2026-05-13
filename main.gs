/**
 * Meta 廣告數據歷史存檔腳本 (每日回補 30 天版)
 * 功能：中文標籤轉換、影片指標提取、自動去重、保留歷史資料
 */
function fetchMetaAdsPersisted() {
  // --- 基本參數設定 ---
  const ACCESS_TOKEN = 'YOUR_ACCESS_TOKEN_HERE'; 
  const AD_ACCOUNT_ID = 'YOUR_AD_ACCOUNT_ID_HERE';
  const SHEET_NAME = 'SHEET_NAME';

  // --- 中文對照表：大目標 (Objective) ---
  const OBJECTIVE_MAP = {
    'OUTCOME_AWARENESS': '品牌知名度',
    'OUTCOME_ENGAGEMENT': '互動',
    'OUTCOME_TRAFFIC': '流量',
    'OUTCOME_LEADS': '開發潛在客戶',
    'OUTCOME_SALES': '銷售',
    'OUTCOME_APP_PROMOTION': '應用程式推廣',
    'POST_ENGAGEMENT': '貼文互動',
    'LINK_CLICKS': '連結點擊',
    'VISIT_INSTAGRAM_PROFILE': 'IG profile瀏覽'
  };

  // --- 中文對照表：優化目標 (Optimization Goal) ---
  const GOAL_MAP = {
    'THRUPLAY': '影片完整觀看',
    'REACH': '不重複觸及',
    'IMPRESSIONS': '每千次展示',
    'LINK_CLICKS': '連結點擊',
    'POST_ENGAGEMENT': '貼文互動',
    'OFFSITE_CONVERSIONS': '網站轉換',
    'LANDING_PAGE_VIEWS': '登陸頁面觀看',
    'VISIT_INSTAGRAM_PROFILE': 'IG profile瀏覽'
  };

  // 欄位清單 (加入 ad_id 以便進行去重比對)
  const fields = [
    'date_start',
    'ad_id',
    'campaign_name',
    'adset_name',
    'ad_name',
    'objective',
    'optimization_goal',
    'spend',
    'impressions',
    'reach',
    'inline_link_clicks',
    'video_p25_watched_actions',
    'video_thruplay_watched_actions',
    'actions'
  ].join(',');

  // 抓取前 30 天 (last_30d) 並按日拆分 (time_increment=1)
  const baseUrl = `https://graph.facebook.com/v20.0/${AD_ACCOUNT_ID}/insights`;
  const url = baseUrl 
    + `?fields=${fields}`
    + `&date_preset=last_30d`
    + `&time_increment=1`
    + `&level=ad`
    + `&limit=500`
    + `&access_token=${ACCESS_TOKEN}`;

  try {
    const response = UrlFetchApp.fetch(url, {"muteHttpExceptions": true});
    const json = JSON.parse(response.getContentText());
    
    if (json.error) {
      console.error('Meta API 報錯: ' + JSON.stringify(json.error));
      return;
    }

    const apiData = json.data;
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
    
    // 如果是全新表格，先建立標題列
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(['唯一索引(Key)', '日期', '廣告活動', '大目標', '優化目標', '廣告組合', '廣告名稱', '花費', '曝光', '觸及人數', '點擊', '25%觀看數', 'ThruPlay數', '成果總計']);
    }

    // 1. 讀取現有表格資料，建立日期與 ID 的索引 (避免重複寫入)
    const lastRow = sheet.getLastRow();
    const keyIndex = {}; 
    if (lastRow > 1) {
      const existingKeys = sheet.getRange(1, 1, lastRow, 1).getValues();
      for (let i = 1; i < existingKeys.length; i++) {
        keyIndex[existingKeys[i][0]] = i + 1; // 記錄該 Key 在第幾列
      }
    }

    // 2. 處理 API 回傳的數據
    if (apiData && apiData.length > 0) {
      apiData.forEach(item => {
        // 建立唯一識別碼 (日期 + 廣告ID)
        const uniqueKey = item.date_start + "_" + item.ad_id;
        
        // 轉換中文標籤
        let chineseObjective = OBJECTIVE_MAP[item.objective] || item.objective;
        let chineseGoal = GOAL_MAP[item.optimization_goal] || item.optimization_goal;

        // 提取影片指標
        let v25 = (item.video_p25_watched_actions && item.video_p25_watched_actions.length > 0) 
                  ? item.video_p25_watched_actions[0].value : 0;
        let thruPlay = (item.video_thruplay_watched_actions && item.video_thruplay_watched_actions.length > 0) 
                       ? item.video_thruplay_watched_actions[0].value : 0;

        // 成果總計
        let results = 0;
        if (item.actions) {
          results = item.actions.reduce((sum, action) => sum + parseInt(action.value), 0);
        }

        const rowData = [
          uniqueKey,
          item.date_start,
          item.campaign_name,
          chineseObjective,
          chineseGoal,
          item.adset_name,
          item.ad_name,
          item.spend,
          item.impressions,
          item.reach || 0,
          item.inline_link_clicks || 0,
          v25,
          thruPlay,
          results
        ];

        // 3. 判斷：更新現有列 或 新增列
        if (keyIndex[uniqueKey]) {
          // 已存在，覆蓋更新 (確保前 7 天的數據如轉換、觀看數是最新的)
          sheet.getRange(keyIndex[uniqueKey], 1, 1, rowData.length).setValues([rowData]);
        } else {
          // 不存在，接在最後面 (保存歷史)
          sheet.appendRow(rowData);
        }
      });
      console.log('歷史資料增量同步完成！');
      console.log('原始資料範例：' + JSON.stringify(apiData[0]));
    }
  } catch (e) {
    console.error('執行失敗: ' + e.toString());
  }
}
