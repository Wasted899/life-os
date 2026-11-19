import type { GuideEntry } from '../../core/types'

/**
 * 默认示例：每类只放一条能确定存在的官方入口。
 *
 * 原则：宁可少，也不放需要猜路径的死链。用户首次进入且 p_guides 为空时播种一次；
 * 播种标记写入后不再重灌，用户删除示例也不会被恢复。
 */
export const BUILTIN_GUIDES: readonly GuideEntry[] = [
  {
    id: 'builtin-baoyan-tuimian',
    category: 'baoyan',
    title: '推免服务系统',
    icon: '🎓',
    body: ['教育部推免服务系统，保研填报志愿与录取确认的官方入口。'],
    links: [{ label: '推免服务系统', url: 'https://yz.chsi.com.cn/tm/' }],
  },
  {
    id: 'builtin-intern-ncss',
    category: 'intern',
    title: '国家大学生就业服务平台',
    icon: '💼',
    body: ['教育部 24365 校园招聘服务平台，汇集实习与校招岗位信息。'],
    links: [{ label: '官网', url: 'https://www.ncss.cn/' }],
  },
  {
    id: 'builtin-kaoyan-yz',
    category: 'kaoyan',
    title: '中国研究生招生信息网',
    icon: '📚',
    body: ['研招网，考研报名、调剂与院校专业查询的官方入口。'],
    links: [{ label: '研招网', url: 'https://yz.chsi.com.cn/' }],
  },
  {
    id: 'builtin-scholarship-xszz',
    category: 'scholarship',
    title: '全国学生资助管理中心',
    icon: '🏅',
    body: ['教育部学生资助官方平台，查询国家奖学金、助学金与助学贷款政策。'],
    links: [{ label: '官网', url: 'https://www.xszz.edu.cn/' }],
  },
]
