/**
 * 内置每日一句词库（M1-19）
 *
 * 来源：旧版 Layout.tsx 的 42 条硬编码，人工整理为结构化常量（不在运行时解析字符串）。
 * id 稳定且带前缀，后续新增内置条目不会与用户自建条目冲突。
 * 统计：Asen 11 条归 lyric（原文倒数 1 条被拍板为 10 条，实际硬编码为 11 条，按全量导入）；
 * 其余 31 条归 quote，其中 2 条无作者（author = ''）。
 */
import type { Quote } from '../../core/types'

export const BUILTIN_QUOTES: Quote[] = [
  { id: 'builtin-asen-01', text: '我名叫志气还有恒心，我早晚要闯出一番名堂', author: 'Asen', source_type: 'lyric' },
  { id: 'builtin-asen-02', text: '每天翻山越岭老子必须爬更高', author: 'Asen', source_type: 'lyric' },
  { id: 'builtin-asen-03', text: '万丈高楼平地起这不是吹的', author: 'Asen', source_type: 'lyric' },
  { id: 'builtin-asen-04', text: '我来自底层，所以我唯一的选择只有往上面爬', author: 'Asen', source_type: 'lyric' },
  { id: 'builtin-asen-05', text: 'Stay true to myself，我才对得起我的天赋', author: 'Asen', source_type: 'lyric' },
  { id: 'builtin-asen-06', text: '你等着我破茧后化成蝶', author: 'Asen', source_type: 'lyric' },
  { id: 'builtin-asen-07', text: "我爱做白日梦，Now I'm living my dream life", author: 'Asen', source_type: 'lyric' },
  { id: 'builtin-asen-08', text: '我就像路飞坐上船，我现在要启程', author: 'Asen', source_type: 'lyric' },
  { id: 'builtin-asen-09', text: 'Now my hard work pays off', author: 'Asen', source_type: 'lyric' },
  { id: 'builtin-asen-10', text: '你赚得少是因为格局太小', author: 'Asen', source_type: 'lyric' },
  { id: 'builtin-asen-11', text: '祖辈在山里面扎根，我要让他们看到我出人头地', author: 'Asen', source_type: 'lyric' },

  { id: 'builtin-einstein-01', text: '生活就像骑自行车，要保持平衡就得不断前进。', author: '爱因斯坦', author_title: '相对论创立者，诺贝尔物理学奖', source_type: 'quote' },
  { id: 'builtin-jobs-01', text: '你的时间有限，不要浪费时间活在别人的生活里。', author: '乔布斯', author_title: '苹果公司创始人', source_type: 'quote' },
  { id: 'builtin-jobs-02', text: '活着就是为了改变世界，难道还有其他原因吗？', author: '乔布斯', author_title: '苹果公司创始人', source_type: 'quote' },
  { id: 'builtin-napoleon-01', text: '我成功是因为我有决心，从不踌躇。', author: '拿破仑', author_title: '法兰西第一帝国皇帝', source_type: 'quote' },
  { id: 'builtin-napoleon-02', text: '胜利属于最坚忍的人。', author: '拿破仑', author_title: '法兰西第一帝国皇帝', source_type: 'quote' },
  { id: 'builtin-edison-01', text: '天才是百分之一的灵感加百分之九十九的汗水。', author: '爱迪生', author_title: '发明大王，1093项专利', source_type: 'quote' },
  { id: 'builtin-edison-02', text: '我没有失败，我只是发现了10000种行不通的方法。', author: '爱迪生', author_title: '发明大王', source_type: 'quote' },
  { id: 'builtin-einstein-02', text: '想象力比知识更重要。', author: '爱因斯坦', author_title: '相对论创立者', source_type: 'quote' },
  { id: 'builtin-churchill-01', text: '成功不是终点，失败也并非末日，最重要的是继续前进的勇气。', author: '丘吉尔', author_title: '英国首相，诺贝尔文学奖', source_type: 'quote' },
  { id: 'builtin-churchill-02', text: '永远永远永远不要放弃。', author: '丘吉尔', author_title: '英国首相', source_type: 'quote' },
  { id: 'builtin-mandela-01', text: '人生最大的荣耀不在于从不跌倒，而在于每次跌倒后都能爬起来。', author: '曼德拉', author_title: '南非前总统，诺贝尔和平奖', source_type: 'quote' },
  { id: 'builtin-mandela-02', text: '教育是最强大的武器，你可以用它来改变世界。', author: '曼德拉', author_title: '南非前总统', source_type: 'quote' },
  { id: 'builtin-bacon-01', text: '知识就是力量。', author: '培根', author_title: '英国唯物主义哲学家', source_type: 'quote' },
  { id: 'builtin-descartes-01', text: '我思故我在。', author: '笛卡尔', author_title: '法国哲学家，解析几何之父', source_type: 'quote' },
  { id: 'builtin-laozi-01', text: '千里之行，始于足下。', author: '老子', author_title: '道家学派创始人', source_type: 'quote' },
  { id: 'builtin-zhouyi-01', text: '天行健，君子以自强不息。', author: '《周易》', author_title: '中国古代经典', source_type: 'quote' },
  { id: 'builtin-xunzi-01', text: '不积跬步，无以至千里；不积小流，无以成江海。', author: '荀子', author_title: '战国思想家', source_type: 'quote' },
  { id: 'builtin-hanyu-01', text: '业精于勤，荒于嬉；行成于思，毁于随。', author: '韩愈', author_title: '唐代文学家，唐宋八大家之首', source_type: 'quote' },
  { id: 'builtin-quyuan-01', text: '路漫漫其修远兮，吾将上下而求索。', author: '屈原', author_title: '战国诗人，楚辞创立者', source_type: 'quote' },
  { id: 'builtin-dufu-01', text: '会当凌绝顶，一览众山小。', author: '杜甫', author_title: '唐代诗圣', source_type: 'quote' },
  { id: 'builtin-libai-01', text: '长风破浪会有时，直挂云帆济沧海。', author: '李白', author_title: '唐代诗仙', source_type: 'quote' },
  { id: 'builtin-newton-01', text: '如果说我看得远，那是因为我站在巨人的肩上。', author: '牛顿', author_title: '经典力学奠基人', source_type: 'quote' },
  { id: 'builtin-darwin-01', text: '物竞天择，适者生存。', author: '达尔文', author_title: '进化论创立者', source_type: 'quote' },
  { id: 'builtin-archimedes-01', text: '给我一个支点，我就能撬动地球。', author: '阿基米德', author_title: '古希腊科学家', source_type: 'quote' },
  { id: 'builtin-einstein-03', text: '成功=艰苦的劳动+正确的方法+少说空话。', author: '爱因斯坦', author_title: '相对论创立者', source_type: 'quote' },
  { id: 'builtin-confucius-01', text: '学而不思则罔，思而不学则殆。', author: '孔子', author_title: '儒家学派创始人', source_type: 'quote' },
  { id: 'builtin-confucius-02', text: '三人行，必有我师焉。', author: '孔子', author_title: '儒家学派创始人', source_type: 'quote' },
  { id: 'builtin-rolland-01', text: '世界上只有一种真正的英雄主义，那就是在认清生活真相之后依然热爱生活。', author: '罗曼·罗兰', author_title: '法国作家，诺贝尔文学奖', source_type: 'quote' },
  { id: 'builtin-vangogh-01', text: '伟大的事情都是由一系列小事汇聚而成的。', author: '梵高', author_title: '后印象派画家', source_type: 'quote' },
  { id: 'builtin-anonymous-01', text: '你今天的努力，是幸运的伏笔。', author: '', source_type: 'quote' },
  { id: 'builtin-anonymous-02', text: '幸福不是拥有你想要的，而是珍惜你拥有的。', author: '', source_type: 'quote' },
]
