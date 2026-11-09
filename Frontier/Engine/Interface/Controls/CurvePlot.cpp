/*======================================================================================================================
                                                               CURVEPLOT.CPP
======================================================================================================================*/
// 🧩 Shared curve editor: interpolation selection, bounded knot dragging, and a live evaluation preview.

#include "Frontier/Engine/Interface/Controls/CurvePlot.h"

#include "Frontier/Engine/Interface/Controls/ActionRow.h"
#include "Frontier/Engine/Interface/Controls/CaptionText.h"
#include "Frontier/Engine/Interface/Controls/ControlColumn.h"
#include "Frontier/Engine/Interface/Controls/DiagramCanvas.h"
#include "Frontier/Engine/Interface/Controls/SelectRow.h"

#include <imgui_internal.h>

#include <algorithm>
#include <array>
#include <cmath>
#include <cstdio>
#include <string>
#include <utility>
#include <vector>

namespace Frontier
{

namespace
{

constexpr float PlotWidth  = 640.0f;
constexpr float PlotHeight = 260.0f;
constexpr float PlotLeft   = 50.0f;
constexpr float PlotRight  = 624.0f;
constexpr float PlotTop    = 16.0f;
constexpr float PlotBottom = 222.0f;
constexpr int   CurveSteps = 192;
constexpr int   GridSteps  = 4;

struct CurveRange
{
    double MinimumInput  = 0.0;
    double MaximumInput  = 1.0;
    double MinimumOutput = 0.0;
    double MaximumOutput = 1.0;
};

CurveRange ResolveRange(const CurveSpecification& Specification) noexcept
{
    CurveRange Range;
    if (Specification.Knots.size() < 2) return Range;
    Range.MinimumInput = Specification.Knots.front().Input;
    Range.MaximumInput = Specification.Knots.back().Input;
    Range.MinimumOutput = Specification.Knots.front().Output;
    Range.MaximumOutput = Specification.Knots.front().Output;
    for (const CurveKnot& Knot : Specification.Knots)
    {
        Range.MinimumOutput = std::min(Range.MinimumOutput, Knot.Output);
        Range.MaximumOutput = std::max(Range.MaximumOutput, Knot.Output);
    }
    double Extent = Range.MaximumOutput - Range.MinimumOutput;
    if (!(Extent > 0.0) || !std::isfinite(Extent)) Extent = std::max(1.0, std::abs(Range.MinimumOutput) * 0.2);
    const double Padding = Extent * 0.12;
    Range.MinimumOutput -= Padding;
    Range.MaximumOutput += Padding;
    return Range;
}

ImVec2 ResolvePlotPoint(double Input, double Output, const CurveRange& Range) noexcept
{
    const double U = (Input - Range.MinimumInput) / (Range.MaximumInput - Range.MinimumInput);
    const double V = (Output - Range.MinimumOutput) / (Range.MaximumOutput - Range.MinimumOutput);
    return ImVec2(PlotLeft + static_cast<float>(U) * (PlotRight - PlotLeft),
                  PlotBottom - static_cast<float>(V) * (PlotBottom - PlotTop));
}

double ResolveInput(float X, const CurveRange& Range) noexcept
{
    const double U = std::clamp((static_cast<double>(X) - PlotLeft) / (PlotRight - PlotLeft), 0.0, 1.0);
    return Range.MinimumInput + U * (Range.MaximumInput - Range.MinimumInput);
}

double ResolveOutput(float Y, const CurveRange& Range) noexcept
{
    const double V = std::clamp((PlotBottom - static_cast<double>(Y)) / (PlotBottom - PlotTop), 0.0, 1.0);
    return Range.MinimumOutput + V * (Range.MaximumOutput - Range.MinimumOutput);
}

bool AcceptCandidate(CurveSpecification& Specification, CurveProfile<double>& Profile, CurveSpecification Candidate,
                     std::string& Diagnostic)
{
    CurveProfile<double> CandidateProfile;
    Diagnostic.clear();
    if (!CandidateProfile.Assign(Candidate, &Diagnostic)) return false;
    Specification = std::move(Candidate);
    Profile = std::move(CandidateProfile);
    return true;
}

bool InsertSelectedKnot(CurveSpecification& Specification, CurveProfile<double>& Profile, int& SelectedKnot,
                        std::string& Diagnostic)
{
    if (Specification.Knots.size() >= CurveProfile<double>::MaximumKnotCount) return false;
    const size_t Left = SelectedKnot + 1 < static_cast<int>(Specification.Knots.size())
                            ? static_cast<size_t>(SelectedKnot)
                            : Specification.Knots.size() - 2;
    const double Input = (Specification.Knots[Left].Input + Specification.Knots[Left + 1].Input) * 0.5;
    CurveSpecification Candidate = Specification;
    const size_t Inserted = Left + 1;
    Candidate.Knots.insert(Candidate.Knots.begin() + static_cast<std::ptrdiff_t>(Inserted),
                           { Input, Profile.Evaluate(Input) });
    if (!AcceptCandidate(Specification, Profile, std::move(Candidate), Diagnostic)) return false;
    SelectedKnot = static_cast<int>(Inserted);
    return true;
}

bool RemoveSelectedKnot(CurveSpecification& Specification, CurveProfile<double>& Profile, int& SelectedKnot,
                        std::string& Diagnostic)
{
    if (Specification.Knots.size() <= 2 || SelectedKnot <= 0 ||
        static_cast<size_t>(SelectedKnot + 1) >= Specification.Knots.size()) return false;
    CurveSpecification Candidate = Specification;
    Candidate.Knots.erase(Candidate.Knots.begin() + SelectedKnot);
    if (!AcceptCandidate(Specification, Profile, std::move(Candidate), Diagnostic)) return false;
    SelectedKnot = std::min(SelectedKnot, static_cast<int>(Specification.Knots.size() - 1));
    return true;
}

void ConstructPlot(DiagramPen& Pen, const CurveSpecification& Specification, const CurveProfile<double>* Profile,
                   const CurveRange& Range, int ActiveKnot)
{
    const ImU32 Grid = ResolveCssColour(0x46515eff);
    const ImU32 Axis = ResolveCssColour(0x788492ff);
    const ImU32 Line = ResolveCssColour(0x65c8ffff);
    const ImU32 KnotColour = ResolveCssColour(0xe8edf4ff);
    const ImU32 ActiveColour = ResolveCssColour(0xffc86aff);

    Pen.Rect(ImVec2(PlotLeft, PlotTop), ImVec2(PlotRight - PlotLeft, PlotBottom - PlotTop),
             ResolveCssColour(0x151a20ff), 6.0f);
    for (int Step = 0; Step <= GridSteps; ++Step)
    {
        const float Fraction = static_cast<float>(Step) / static_cast<float>(GridSteps);
        const float X = PlotLeft + Fraction * (PlotRight - PlotLeft);
        const float Y = PlotTop + Fraction * (PlotBottom - PlotTop);
        Pen.Line(ImVec2(X, PlotTop), ImVec2(X, PlotBottom), Grid, Step == 0 || Step == GridSteps ? 1.2f : 0.7f);
        Pen.Line(ImVec2(PlotLeft, Y), ImVec2(PlotRight, Y), Grid, Step == 0 || Step == GridSteps ? 1.2f : 0.7f);
    }
    Pen.Line(ImVec2(PlotLeft, PlotBottom), ImVec2(PlotRight, PlotBottom), Axis, 1.2f);
    Pen.Line(ImVec2(PlotLeft, PlotTop), ImVec2(PlotLeft, PlotBottom), Axis, 1.2f);

    char Label[40];
    for (int Step = 0; Step <= GridSteps; ++Step)
    {
        const double Fraction = static_cast<double>(Step) / static_cast<double>(GridSteps);
        const double Input = Range.MinimumInput + Fraction * (Range.MaximumInput - Range.MinimumInput);
        const double Output = Range.MaximumOutput - Fraction * (Range.MaximumOutput - Range.MinimumOutput);
        std::snprintf(Label, sizeof(Label), "%.3g", Input);
        Pen.Text(ImVec2(PlotLeft + static_cast<float>(Fraction) * (PlotRight - PlotLeft), PlotBottom + 18.0f), Label,
                 ResolveCssColour(0x9ba6b3ff), 9.0f);
        std::snprintf(Label, sizeof(Label), "%.3g", Output);
        const float LabelY = PlotTop + static_cast<float>(Step) / GridSteps * (PlotBottom - PlotTop) + 3.0f;
        Pen.Text(ImVec2(PlotLeft - 10.0f, LabelY), Label, ResolveCssColour(0x9ba6b3ff), 9.0f, 1);
    }

    if (Profile != nullptr && Profile->IsValid())
    {
        std::vector<ImVec2> Points;
        Points.reserve(CurveSteps + 1);
        for (int Step = 0; Step <= CurveSteps; ++Step)
        {
            const double Fraction = static_cast<double>(Step) / CurveSteps;
            const double Input = Range.MinimumInput + Fraction * (Range.MaximumInput - Range.MinimumInput);
            Points.push_back(ResolvePlotPoint(Input, Profile->Evaluate(Input), Range));
        }
        Pen.Path(Points, Line, 2.2f);
    }

    for (size_t Index = 0; Index < Specification.Knots.size(); ++Index)
    {
        const CurveKnot& Knot = Specification.Knots[Index];
        const ImVec2 Point = ResolvePlotPoint(Knot.Input, Knot.Output, Range);
        const bool IsActive = static_cast<int>(Index) == ActiveKnot;
        Pen.Circle(Point, IsActive ? 7.0f : 5.5f, IsActive ? ActiveColour : KnotColour,
                   ResolveCssColour(IsActive ? 0x222831ff : 0x26303aff));
    }
    Pen.Text(ImVec2((PlotLeft + PlotRight) * 0.5f, PlotHeight - 2.0f), "Input", ResolveCssColour(0xb4becaff), 9.0f);
    Pen.Text(ImVec2(PlotRight, PlotTop - 4.0f), "Output", ResolveCssColour(0xb4becaff), 9.0f, 1);
}

} // namespace

bool CurvePlot::Construct(ControlColumn& Column, const char* Id, CurveSpecification& Specification, bool Enabled)
{
    if (Id == nullptr || Specification.Knots.size() < 2) return false;
    ImGui::PushID(Id);
    bool Changed = false;
    std::string Diagnostic;
    CurveProfile<double> Profile;
    const bool Valid = Profile.Assign(Specification, &Diagnostic);

    static constexpr const char* InterpolationNames[] = { "Linear", "Clamped Hermite", "Monotonic PCHIP" };
    int Interpolation = static_cast<int>(Specification.Interpolation);
    if (SelectRow::Construct(Column, "Interpolation", "Interpolation", InterpolationNames, 3, Interpolation, Enabled,
                             "Interpolation is applied to the curve evaluation preview.") &&
        Interpolation >= 0 && Interpolation <= 2)
    {
        CurveSpecification Candidate = Specification;
        Candidate.Interpolation = static_cast<CurveInterpolation>(Interpolation);
        if (AcceptCandidate(Specification, Profile, std::move(Candidate), Diagnostic)) Changed = true;
    }

    if (!Profile.IsValid())
    {
        CaptionText::Construct(Column, Diagnostic.c_str(), 4.0f, 8.0f);
        ImGui::PopID();
        return Changed;
    }

    ImGuiStorage* Storage = ImGui::GetStateStorage();
    const ImGuiID SelectedId = ImGui::GetID("CurvePlotSelectedKnot");
    const ImGuiID DraggingId = ImGui::GetID("CurvePlotDraggingKnot");
    int SelectedKnot = std::clamp(Storage->GetInt(SelectedId, 0), 0, static_cast<int>(Specification.Knots.size() - 1));
    int DraggingKnot = Storage->GetInt(DraggingId, -1);
    const bool CanInsert = Specification.Knots.size() < CurveProfile<double>::MaximumKnotCount;
    const bool CanRemove = Specification.Knots.size() > 2 && SelectedKnot > 0 &&
                           static_cast<size_t>(SelectedKnot + 1) < Specification.Knots.size();
    const std::array<ActionEntry, 2> Actions = {{
        { "InsertKnot", "Add knot", CanInsert, "Insert on the adjacent interval around the selected knot." },
        { "RemoveKnot", "Remove knot", CanRemove, "Remove the selected interior knot; endpoints define the domain." },
    }};
    const int Action = ActionRow::Construct(Column, Actions);
    if (Action == 0 && CanInsert)
        Changed |= InsertSelectedKnot(Specification, Profile, SelectedKnot, Diagnostic);
    else if (Action == 1 && CanRemove)
        Changed |= RemoveSelectedKnot(Specification, Profile, SelectedKnot, Diagnostic);
    Storage->SetInt(SelectedId, SelectedKnot);

    DiagramDrag Drag;
    DiagramPen Pen = DiagramCanvas::Begin(Column, "CurveCanvas", PlotWidth, PlotHeight, 8.0f, 8.0f,
                                         Enabled ? &Drag : nullptr,
                                         "Drag knots. Focus the plot: arrows edit; Insert/Delete add or remove; Home/End select endpoints.");
    const CurveRange Range = ResolveRange(Specification);

    if (Drag.Start)
    {
        DraggingKnot = -1;
        float Nearest = 14.0f;
        for (size_t Index = 0; Index < Specification.Knots.size(); ++Index)
        {
            const CurveKnot& Knot = Specification.Knots[Index];
            const ImVec2 Point = ResolvePlotPoint(Knot.Input, Knot.Output, Range);
            const float DX = Point.x - Drag.Point.x;
            const float DY = Point.y - Drag.Point.y;
            const float Distance = std::sqrt(DX * DX + DY * DY);
            if (Distance < Nearest)
            {
                Nearest = Distance;
                DraggingKnot = static_cast<int>(Index);
            }
        }
        if (DraggingKnot >= 0) SelectedKnot = DraggingKnot;
        Storage->SetInt(SelectedId, SelectedKnot);
        Storage->SetInt(DraggingId, DraggingKnot);
    }

    if (Drag.Engaged && DraggingKnot >= 0 && static_cast<size_t>(DraggingKnot) < Specification.Knots.size())
    {
        CurveSpecification Candidate = Specification;
        CurveKnot& Knot = Candidate.Knots[static_cast<size_t>(DraggingKnot)];
        const CurveKnot Original = Knot;
        if (DraggingKnot > 0 && static_cast<size_t>(DraggingKnot + 1) < Candidate.Knots.size())
        {
            const double Span = Range.MaximumInput - Range.MinimumInput;
            const double LeftGap = Knot.Input - Candidate.Knots[static_cast<size_t>(DraggingKnot - 1)].Input;
            const double RightGap = Candidate.Knots[static_cast<size_t>(DraggingKnot + 1)].Input - Knot.Input;
            const double Margin = std::min(Span * 1.0e-6, std::min(LeftGap, RightGap) * 0.25);
            Knot.Input = std::clamp(ResolveInput(Drag.Point.x, Range),
                                    Candidate.Knots[static_cast<size_t>(DraggingKnot - 1)].Input + Margin,
                                    Candidate.Knots[static_cast<size_t>(DraggingKnot + 1)].Input - Margin);
        }
        Knot.Output = ResolveOutput(Drag.Point.y, Range);
        if (Knot.Input != Original.Input || Knot.Output != Original.Output)
            Changed |= AcceptCandidate(Specification, Profile, std::move(Candidate), Diagnostic);
    }
    else if (!Drag.Engaged)
    {
        DraggingKnot = -1;
        Storage->SetInt(DraggingId, -1);
    }

    if (Enabled && Drag.Key != ImGuiKey_None)
    {
        if (Drag.Key == ImGuiKey_Home) SelectedKnot = 0;
        else if (Drag.Key == ImGuiKey_End) SelectedKnot = static_cast<int>(Specification.Knots.size() - 1);
        else if (Drag.Key == ImGuiKey_Insert)
            Changed |= InsertSelectedKnot(Specification, Profile, SelectedKnot, Diagnostic);
        else if (Drag.Key == ImGuiKey_Delete)
            Changed |= RemoveSelectedKnot(Specification, Profile, SelectedKnot, Diagnostic);
        else
        {
            CurveSpecification Candidate = Specification;
            CurveKnot& Knot = Candidate.Knots[static_cast<size_t>(SelectedKnot)];
            const CurveKnot Original = Knot;
            const double InputStep = (Range.MaximumInput - Range.MinimumInput) * 0.002 * Drag.Step;
            const double OutputStep = (Range.MaximumOutput - Range.MinimumOutput) * 0.01 * Drag.Step;
            if (Drag.Key == ImGuiKey_LeftArrow && SelectedKnot > 0 &&
                static_cast<size_t>(SelectedKnot + 1) < Candidate.Knots.size())
            {
                const double Left = Candidate.Knots[static_cast<size_t>(SelectedKnot - 1)].Input;
                const double Right = Candidate.Knots[static_cast<size_t>(SelectedKnot + 1)].Input;
                const double Margin = std::min(Right - Left, Range.MaximumInput - Range.MinimumInput) * 1.0e-6;
                Knot.Input = std::max(Left + Margin, Knot.Input - InputStep);
            }
            else if (Drag.Key == ImGuiKey_RightArrow && SelectedKnot > 0 &&
                     static_cast<size_t>(SelectedKnot + 1) < Candidate.Knots.size())
            {
                const double Left = Candidate.Knots[static_cast<size_t>(SelectedKnot - 1)].Input;
                const double Right = Candidate.Knots[static_cast<size_t>(SelectedKnot + 1)].Input;
                const double Margin = std::min(Right - Left, Range.MaximumInput - Range.MinimumInput) * 1.0e-6;
                Knot.Input = std::min(Right - Margin, Knot.Input + InputStep);
            }
            else if (Drag.Key == ImGuiKey_UpArrow) Knot.Output += OutputStep;
            else if (Drag.Key == ImGuiKey_DownArrow) Knot.Output -= OutputStep;
            if (Knot.Input != Original.Input || Knot.Output != Original.Output)
                Changed |= AcceptCandidate(Specification, Profile, std::move(Candidate), Diagnostic);
        }
        Storage->SetInt(SelectedId, SelectedKnot);
    }

    const CurveRange DrawRange = ResolveRange(Specification);
    const int HighlightKnot = DraggingKnot >= 0 ? DraggingKnot : SelectedKnot;
    ConstructPlot(Pen, Specification, Valid || Changed ? &Profile : nullptr, DrawRange, HighlightKnot);
    if (!Diagnostic.empty()) CaptionText::Construct(Column, Diagnostic.c_str(), 4.0f, 8.0f);
    ImGui::PopID();
    return Changed;
}

} // namespace Frontier
