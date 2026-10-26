class Role:
    SYSTEM_ADMIN = "مدیر سامانه"
    UNIT_MANAGER = "مدیر واحد"
    GRC_MEMBER = "عضو GRC"  # کارشناس ریسک و متولی روش
    SECURITY_WORKGROUP = "کارگروه امنیت"  # کارگروه ریسک 
    SECURITY_COMMITTEE = "کمیته امنیت"  # صاحب اختیار ریسک بالا و بحرانی
    VIEWER = "فقط مشاهده"

    ALL = [
        SYSTEM_ADMIN,
        UNIT_MANAGER,
        GRC_MEMBER,
        SECURITY_WORKGROUP,
        SECURITY_COMMITTEE,
        VIEWER,
    ]
