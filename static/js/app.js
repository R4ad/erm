// تقویم شمسی برای هر input که data-jdp دارد. در این تقویم شنبه 0 و جمعه 6 است.
jalaliDatepicker.startWatch({
  dayRendering: (day) => ({ isHoliday: day.weekDay >= 5 }),  // پنجشنبه و جمعه قرمز
});