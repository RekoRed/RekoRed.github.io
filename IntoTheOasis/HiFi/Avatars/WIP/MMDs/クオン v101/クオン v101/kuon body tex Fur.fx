////////////////////////////////////////////////////////////////////////////////////////////////
//  FurShader
//     毛皮シェーダー
//		Program by T.Ogura
//		（MME/基本シェーダー製作 舞力介入P)
////////////////////////////////////////////////////////////////////////////////////////////////
// 毛シェーダー用　コントロールパラメータ

const float FurSupecularPower =0.5;      // 毛の光る範囲
const float FurFlowScale = float2(100,1); // 毛の流れる量
const float3 FurColor = float3(0.2, 0.2, 0.2); // 毛の色

int FurShellCount = 40; // FurShellの枚数
const float FurLength = 1/100.0;  // FurShellの幅
////////////////////////////////////////////////////////////////////////////////////////////////
// パラメータ宣言

// 座法変換行列
float4x4 WorldViewProjMatrix      : WORLDVIEWPROJECTION;
float4x4 WorldMatrix              : WORLD;
float4x4 ViewMatrix               : VIEW;
float4x4 LightWorldViewProjMatrix : WORLDVIEWPROJECTION < string Object = "Light"; >;

float3   LightDirection    : DIRECTION < string Object = "Light"; >;
float3   CameraPosition    : POSITION  < string Object = "Camera"; >;

// マテリアル色
float4   MaterialDiffuse   : DIFFUSE  < string Object = "Geometry"; >;
float3   MaterialAmbient   : AMBIENT  < string Object = "Geometry"; >;
float3   MaterialEmmisive  : EMISSIVE < string Object = "Geometry"; >;
float3   MaterialSpecular  : SPECULAR < string Object = "Geometry"; >;
float    SpecularPower     : SPECULARPOWER < string Object = "Geometry"; >;
float3   MaterialToon      : TOONCOLOR;
// ライト色
float3   LightDiffuse      : DIFFUSE   < string Object = "Light"; >;
float3   LightAmbient      : AMBIENT   < string Object = "Light"; >;
float3   LightSpecular     : SPECULAR  < string Object = "Light"; >;
static float4 DiffuseColor  = MaterialDiffuse  * float4(LightDiffuse, 1.0f);
static float3 AmbientColor  = MaterialAmbient  * LightAmbient + MaterialEmmisive;
static float3 SpecularColor = MaterialSpecular * LightSpecular;

bool     parthf;   // パースペクティブフラグ
bool     transp;   // 半透明フラグ
bool	 spadd;    // スフィアマップ加算合成フラグ
#define SKII1    1500
#define SKII2    8000
#define Toon     3

// オブジェクトのテクスチャ
texture ObjectTexture: MATERIALTEXTURE;
sampler ObjTexSampler = sampler_state {
    texture = <ObjectTexture>;
    MINFILTER = LINEAR;
    MAGFILTER = LINEAR;
	MIPFILTER = LINEAR;
    ADDRESSU  = WRAP;
    ADDRESSV  = WRAP;
};

///////////////////////////////////////////////////////////////////////////////////////////////
// オブジェクト描画（セルフシャドウON）

// シャドウバッファのサンプラ。"register(s0)"なのはMMDがs0を使っているから
sampler DefSampler : register(s0);

struct BufferShadow_OUTPUT {
    float4 Pos      : POSITION;     // 射影変換座標
    float4 ZCalcTex : TEXCOORD0;    // Z値
    float2 Tex      : TEXCOORD1;    // テクスチャ
    float3 Normal   : TEXCOORD2;    // 法線
    float3 Eye      : TEXCOORD3;    // カメラとの相対位置
//    float2 SpTex    : TEXCOORD4;	 // スフィアマップテクスチャ座標
    float4 Color    : COLOR0;       // ディフューズ色
};

//-----------------------------------------------------------------------------------------------

int nFur;               // 現在描画中のFurShell番号

texture2D fur_tex <
   string ResourceName = "a_tex_fur.tga";// Fur発生テクスチャ。付属のテクスチャは服のボタン部分は黒くなっている
   int Miplevels = 1;
>;
sampler FurSampler = sampler_state {
   texture = <fur_tex>;
};

//-----------------------------------------------------------------------------------------------

int nFurDepth;               // FurShellの描写深度

texture2D fur_tex_depth <
   string ResourceName = "kuon body tex Fur.png";// Furdepth発生テクスチャ
   int Miplevels = 1;
>;
sampler FurDepSampler = sampler_state {
   texture = <fur_tex_depth>;
};

// 頂点シェーダ （基本形修正のため不必要な計算もしてる）
BufferShadow_OUTPUT Fur_VS(float4 Pos : POSITION, float3 Normal : NORMAL, float2 Tex : TEXCOORD0, uniform bool useToon)
{
    BufferShadow_OUTPUT Out = (BufferShadow_OUTPUT)0;

    // カメラ視点のワールドビュー射影変換
    Out.Pos = mul( Pos+float4(Normal.xyz*FurLength,0)*nFur, WorldViewProjMatrix ); // FurShellを法線方向に膨らませる
	Out.Pos.y -=Normal.y * FurLength * (nFur / FurShellCount); // FurShellをy軸方向に下げる
	
    Out.Eye = CameraPosition - mul( Pos, WorldMatrix );
    Out.Normal = normalize( mul( Normal, (float3x3)WorldMatrix ) );
    Out.ZCalcTex = mul( Pos, LightWorldViewProjMatrix );
    // ディフューズ色＋アンビエント色 計算
    Out.Color.rgb = AmbientColor;
    if ( !useToon ) {
        Out.Color.rgb += max(0,dot( Out.Normal, -LightDirection )) * DiffuseColor.rgb;
    }
    Out.Color.a = DiffuseColor.a;
    Out.Color = saturate( Out.Color );

    Out.Tex = Tex;// テクスチャ座標
    return Out;
}
float ftime : TIME <bool SyncInEditMode=false;>;

float4 Fur_PS(BufferShadow_OUTPUT IN,  uniform bool useToon) : COLOR
{
	
	
    // スペキュラ色計算
    float3 HalfVector = normalize( normalize(IN.Eye) ); // 毛の光り方。好みの問題かも
	//float3 HalfVector = normalize( normalize(IN.Eye)  + -LightDirection );
    float3 Specular = 1.0-pow( max(0,dot( HalfVector, normalize(IN.Normal) )), FurSupecularPower ) * float3(1,1,1);
    
    float4 Color = IN.Color;
 	float4 TexColor =  tex2D( ObjTexSampler, IN.Tex ) * IN.Color;   // テクスチャカラー

    float2 furDir = float2(1.0, 0.0);
	
	float4 furdep = tex2D( FurDepSampler, IN.Tex);
	nFurDepth = FurShellCount * furdep.r;
	
    Color.rgb = lerp( TexColor, TexColor + FurColor, Specular.r); // Specular.rによってTexColor -> FurColorに変化させる
//    Color.rgb = lerp( float3(0,0,0), FurColor, Specular.r); // 最初の版（動画）はこっち
	
	// うねうねな実験(GPUに超高負荷)
	float2 furDire = float2(sin(ftime+IN.Tex.x*20),cos(ftime+IN.Tex.y*40));
	//Color.rgb = float3(1.0-(furDir.x+1.0)/2.0,(furDir.x+1.0)/2.0,(furDir.y+1.0)/2.0) * Specular.r;
     
     // 毛テクスチャから毛部分のアルファを決定。毛先に行くほど薄くなる
    if(nFur < nFurDepth) {
		Color.w = tex2D( FurSampler, IN.Tex- furDir / FurFlowScale * nFur).r * (1.0-nFur/(FurShellCount-1.0)); 
    }else{
    	Color.w = 0;
    }
	// return Color; // Furに対するセルフシャドウはあまり良くないので、ここで打ち切るのもあり
    
    // テクスチャ座標に変換
    IN.ZCalcTex /= IN.ZCalcTex.w;
    float2 TransTexCoord;
    TransTexCoord.x = (1.0f + IN.ZCalcTex.x)*0.5f;
    TransTexCoord.y = (1.0f - IN.ZCalcTex.y)*0.5f;
	
    if( any( saturate(TransTexCoord) != TransTexCoord ) ) { 
        return Color;
    } else {
        float comp;
        if(parthf) {
            // セルフシャドウ mode2
            comp=1-saturate(max(IN.ZCalcTex.z-tex2D(DefSampler,TransTexCoord).r , 0.0f)*SKII2*TransTexCoord.y-0.3f);
        } else {
            // セルフシャドウ mode1
            comp=1-saturate(max(IN.ZCalcTex.z-tex2D(DefSampler,TransTexCoord).r , 0.0f)*SKII1-0.3f);
        }
        return Color * ( 0.7 +  comp *0.3) ; // 影の所は少し暗くする
    }
}

// 11番がジャケット部分のモデル
// テクスチャが適用されたモデルのみ対応
technique MainTecBS5  <
	string MMDPass = "object_ss";
	bool UseTexture = true; bool UseToon = true;

       string Script =
	       "Pass = DrawObject;"
           "LoopByCount=FurShellCount;"
           "LoopGetIndex=nFur;"
           "Pass=Fur;"
           "LoopEnd=;";

> {
    // 下地のジャケットをディフォルトシェーダーで描画する
    pass DrawObject {
    }
    // 毛シェーダー
    pass Fur {
	    AlphaBlendEnable = TRUE;
		ZEnable      = TRUE;
		ZWriteEnable = false; // 毛部分はDepthバッファを更新しない
		CULLMODE = CCW;

        VertexShader = compile vs_2_0 Fur_VS(true);
        PixelShader  = compile ps_2_0 Fur_PS(true);
    }
}
