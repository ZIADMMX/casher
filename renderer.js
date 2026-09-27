console.log('Renderer process loaded successfully.');

async function testConnection() {
  const response = await window.electronAPI.ping();
  console.log('Response from main process:', response);

  // نعرضها كمان في الصفحة عشان نتأكد بالعين
  const appDiv = document.getElementById('app');
  appDiv.innerText = response;
}

testConnection();