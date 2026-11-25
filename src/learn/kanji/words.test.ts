import { describe, expect, it } from 'vitest';
import { ALL_KANJI, KANJI_GRADES, kanjiEntry, kanjiGrade, splitWord } from './words';

// 学年別漢字配当表（2017年告示）。出題順の確認用
const OFFICIAL = [
  '一右雨円王音下火花貝学気九休玉金空月犬見五口校左三山子四糸字耳七車手十出女小上森人水正生青夕石赤千川先早草足村大男竹中虫町天田土二日入年白八百文木本名目立力林六',
  '引羽雲園遠何科夏家歌画回会海絵外角楽活間丸岩顔汽記帰弓牛魚京強教近兄形計元言原戸古午後語工公広交光考行高黄合谷国黒今才細作算止市矢姉思紙寺自時室社弱首秋週春書少場色食心新親図数西声星晴切雪船線前組走多太体台地池知茶昼長鳥朝直通弟店点電刀冬当東答頭同道読内南肉馬売買麦半番父風分聞米歩母方北毎妹万明鳴毛門夜野友用曜来里理話',
  '悪安暗医委意育員院飲運泳駅央横屋温化荷界開階寒感漢館岸起期客究急級宮球去橋業曲局銀区苦具君係軽血決研県庫湖向幸港号根祭皿仕死使始指歯詩次事持式実写者主守取酒受州拾終習集住重宿所暑助昭消商章勝乗植申身神真深進世整昔全相送想息速族他打対待代第題炭短談着注柱丁帳調追定庭笛鉄転都度投豆島湯登等動童農波配倍箱畑発反坂板皮悲美鼻筆氷表秒病品負部服福物平返勉放味命面問役薬由油有遊予羊洋葉陽様落流旅両緑礼列練路和',
  '愛案以衣位茨印英栄媛塩岡億加果貨課芽賀改械害街各覚潟完官管関観願岐希季旗器機議求泣給挙漁共協鏡競極熊訓軍郡群径景芸欠結建健験固功好香候康佐差菜最埼材崎昨札刷察参産散残氏司試児治滋辞鹿失借種周祝順初松笑唱焼照城縄臣信井成省清静席積折節説浅戦選然争倉巣束側続卒孫帯隊達単置仲沖兆低底的典伝徒努灯働特徳栃奈梨熱念敗梅博阪飯飛必票標不夫付府阜富副兵別辺変便包法望牧末満未民無約勇要養浴利陸良料量輪類令冷例連老労録',
  '圧囲移因永営衛易益液演応往桜可仮価河過快解格確額刊幹慣眼紀基寄規喜技義逆久旧救居許境均禁句型経潔件険検限現減故個護効厚耕航鉱構興講告混査再災妻採際在財罪殺雑酸賛士支史志枝師資飼示似識質舎謝授修述術準序招証象賞条状常情織職制性政勢精製税責績接設絶祖素総造像増則測属率損貸態団断築貯張停提程適統堂銅導得毒独任燃能破犯判版比肥非費備評貧布婦武復複仏粉編弁保墓報豊防貿暴脈務夢迷綿輸余容略留領歴',
  '胃異遺域宇映延沿恩我灰拡革閣割株干巻看簡危机揮貴疑吸供胸郷勤筋系敬警劇激穴券絹権憲源厳己呼誤后孝皇紅降鋼刻穀骨困砂座済裁策冊蚕至私姿視詞誌磁射捨尺若樹収宗就衆従縦縮熟純処署諸除承将傷障蒸針仁垂推寸盛聖誠舌宣専泉洗染銭善奏窓創装層操蔵臓存尊退宅担探誕段暖値宙忠著庁頂腸潮賃痛敵展討党糖届難乳認納脳派拝背肺俳班晩否批秘俵腹奮並陛閉片補暮宝訪亡忘棒枚幕密盟模訳郵優預幼欲翌乱卵覧裏律臨朗論',
];

describe('漢字の単語データ', () => {
  it('学年ごとの字数は 80/160/200/202/193/191、全部で1026字', () => {
    expect(KANJI_GRADES.map(g => g.length)).toEqual([80, 160, 200, 202, 193, 191]);
    expect(ALL_KANJI.length).toBe(1026);
  });

  it('並びは配当表の順', () => {
    expect(KANJI_GRADES.map(g => g.map(e => e.kanji).join(''))).toEqual(OFFICIAL);
  });

  it('学年をまたいでも同じ字がない', () => {
    expect(new Set(ALL_KANJI.map(e => e.kanji)).size).toBe(ALL_KANJI.length);
    for (const e of ALL_KANJI) expect([...e.kanji].length).toBe(1);
  });

  it('各字 2〜3語、同じ語がない。各語に [ ] がちょうど1つで、中はひらがな', () => {
    for (const e of ALL_KANJI) {
      expect(e.words.length, e.kanji).toBeGreaterThanOrEqual(2);
      expect(e.words.length, e.kanji).toBeLessThanOrEqual(3);
      expect(new Set(e.words).size, e.kanji).toBe(e.words.length);
      for (const w of e.words) {
        expect(w.match(/\[/g)?.length, `${e.kanji} ${w}`).toBe(1);
        expect(w.match(/\]/g)?.length, `${e.kanji} ${w}`).toBe(1);
        const s = splitWord(w);
        expect(s, `${e.kanji} ${w}`).not.toBeNull();
        expect(s!.reading, `${e.kanji} ${w}`).toMatch(/^[ぁ-ゖー]+$/);
      }
    }
  });

  it('字から引ける', () => {
    expect(kanjiEntry('山')?.words.length).toBeGreaterThan(0);
    expect(kanjiGrade('一')).toBe(1);
    expect(kanjiGrade('論')).toBe(6);
    expect(kanjiEntry('x')).toBeUndefined();
  });

  it('splitWord は読みの前後に分ける', () => {
    expect(splitWord('か[ざん]')).toEqual({ before: 'か', reading: 'ざん', after: '' });
    expect(splitWord('[やま]のぼり')).toEqual({ before: '', reading: 'やま', after: 'のぼり' });
    expect(splitWord('やま')).toBeNull();
    expect(splitWord('[や][ま]')).toBeNull();
  });
});
