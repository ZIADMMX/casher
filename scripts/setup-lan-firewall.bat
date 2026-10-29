@echo off
chcp 65001 >nul
title Kashiear POS - إعداد جدار الحماية والشبكة المحلية

:: 1. التحقق من صلاحيات المسؤول (Administrator)
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [!] جاري طلب صلاحيات المسؤول لتطبيق قواعد جدار حماية Windows...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

cls
echo =====================================================================
echo           Kashiear POS - أداة إعداد الشبكة وجدار الحماية
echo =====================================================================
echo.

:: 2. إضافة قاعدة في جدار حماية ويندوز للسماح بالمنفذ 5000
echo [+] جاري فتح المنفذ 5000 في جدار حماية Windows (TCP Inbound)...
netsh advfirewall firewall delete rule name="Kashiear POS Local Server" >nul 2>&1
netsh advfirewall firewall add rule name="Kashiear POS Local Server" dir=in action=allow protocol=TCP localport=5000 profile=any >nul 2>&1

if %errorLevel% equ 0 (
    echo [✓] تم فتح المنفذ 5000 بنجاح في جدار الحماية!
) else (
    echo [X] حدث خطأ أثناء إضافة القاعدة في جدار الحماية.
)

echo.
echo ---------------------------------------------------------------------
echo معلومات الاتصال الخاصة بهذا الجهاز (الجهاز الرئيسي - Server):
echo ---------------------------------------------------------------------
echo اسم الجهاز (Computer Name): %COMPUTERNAME%
echo.
echo العناوين المتاحة للاتصال من أجهزة الكاشير الأخرى:
echo 1. عبر اسم الجهاز (موصى به - لا يتغير إذا تغير الـ IP):
echo    http://%COMPUTERNAME%:5000
echo.
echo 2. عبر الـ IP الحالي في الشبكة المحلية:
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4 Address" /c:"عنوان IPv4"') do (
    set "ip=%%a"
    set "ip=!ip: =!"
    echo    http:%%a:5000
)

echo.
echo =====================================================================
echo تعليمات ربط أجهزة الكاشير الأخرى:
echo 1. افتح تطبيق Kashiear على جهاز الكاشير الفرعي (Client).
echo 2. في شاشة الدخول اختر (كاشير فرعي - Branch Node).
echo 3. الصق أحد العناوين الموضحة أعلاه واضغط (حفظ وربط).
echo =====================================================================
echo.
pause
